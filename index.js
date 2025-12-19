const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

const uri = process.env.MONGODB_URI;

// MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


app.get('/', (req, res) => {
  res.send("AssetVerse server is running")
})

async function run() {
  try {
    // Connect to MongoDB but have to comment for vercel deploy
    await client.connect();

    // ---Collections---
    const db = client.db("AssetVerse_DB")
    const usersCollection = db.collection('users')
    const assetsCollection = db.collection('assets')
    const requestsCollection = db.collection('requests')
    const affiliationCollection = db.collection('employeeAffiliations')
    const paymentCollection = db.collection('payments')

    // -----Middlewares-----

    // VerifyToken 
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
      })
    }

    // Verify HR 
    const verifyHR = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      const isHR = user?.role === 'hr'
      if (!isHR) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }

    // ----Authentication through JWT

    // Generate Token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // User Related API

    // Role checking ----VERIFYTOKEN Add korte hobe
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email

      // if(email !== req.decoded.email){
      //   return res.status(401).send({message: 'unauthorized access'}
      //   )
      // }

      const query = { email: email }
      const user = await usersCollection.findOne(query, { projection: { role: 1, _id: 0 } })

      res.send({ role: user?.role })
    })

    // Create user
    app.post('/users', async (req, res) => {
      const userData = req.body

      // Social Login Protection
      const query = { email: userData.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null })
      }

      // Based on Role

      let newUser = {}

      if (userData.role === 'hr') {
        // HR Registration
        newUser = {
          name: userData.name,
          email: userData.email,
          companyName: userData.companyName,
          companyLogo: userData.companyLogo,
          dateOfBirth: userData.dateOfBirth,
          userPhoto: userData.userPhoto,
          // Auto-assigned Fields
          role: 'hr',
          packageLimit: 5,
          currentEmployees: 0,
          subscription: 'basic'
        }
      }
      if (userData.role === 'employee') {
        //Employee Registration   
        newUser = {
          name: userData.name,
          email: userData.email,
          dateOfBirth: userData.dateOfBirth,
          userPhoto: userData.userPhoto,
          // Auto-assigned
          role: 'employee'
        }
      }

      // Save to MongoDB
      const result = await usersCollection.insertOne(newUser)
      res.send(result)
      console.log(userData);

    })

    // Get users profile
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    // Update user profile
    app.patch('/users/:email', async (req, res) => {
      const email = req.params.email
      const updates = req.body
      const query = { email: email }
      const updatedDoc = {
        $set: { ...updates }
      }
      const result = await usersCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    // ASSETS API 

    // Add asset hr only
    app.post('/assets', async (req, res) => {
      const asset = req.body
      asset.dateAdded = new Date()
      asset.productQuantity = parseInt(asset.productQuantity)
      const result = await assetsCollection.insertOne(asset)
    })

    // Get Assets with filtered, search, pagination
    app.get('/assets', async (req, res) => {
      const email = req.query.email
      const search = req.query.search || ""
      const filterType = req.query.filter || ""
      const sortOrder = req.query.sort || ""

      let query = {
        hrEmail: email,
        productName: { $regex: search, $options: 'i' }
      }

      if (filterType) {
        query.productType = filterType
      }

      // Pagination
      const page = parseInt(req.query.page) || 0
      const limit = parseInt(req.query.limit) || 0
      const skip = page * limit

      let options = {}
      if (sortOrder === 'asc') options.sort = { productQuantity: 1 }
      if (sortOrder === 'desc') options.sort = { productQuantity: -1 }

      const cursor = assetsCollection.find(query, options).skip(skip).limit(limit)
      const result = await cursor.toArray()
      res.send(result);
    })

    // Delete Asset
    app.delete('/assets/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await assetsCollection.deleteOne(query)
      req.send(result)
    })

    // Update Asset
    app.patch('/assets/:id', async (req, res) => {
      const id = req.params.id
      const data = req.body
      const query = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          productName: data.productName,
          productType: data.productType,
          productQuantity: parseInt(data.productQuantity),
        }
      }
      const result = await assetsCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    // Request API

    // Employee requests Assets
    app.post('/requests', async (req, res) => {
      const request = req.body
      request.requestDate = new Date()
      request.requestStatus = 'pending'
      const result = await requestsCollection.insertOne(request)
      res.send(result)
    })

    // Get requests 
    app.get('/requests', async (req, res) => {
      const { email, hrEmail, search } = req.query
      let(email) = {}
      // Employee : My requests
      query.requesterEmail = email
      if (search) query.assetName = { $regex: search, $options: 'i' }
      else if (hrEmail) {
        // All request
        query.hrEmail = hrEmail
        if (search) query.requesterEmail = { $regex: search, $options: 'i' }
      }
      const result = await requestsCollection.find(query).toArray()
      res.send(result)
    })

    // Asset request Accept or Reject (HR Only)
    app.patch('/requests/:id', async (req, res) => {
      const id = req.params.id
      const { status } = req.body
      const query = { _id: new ObjectId(id) }
      const request = await requestsCollection.findOne(query)

      if (!request) return res.status(404).send({ message: "Request not found" })

      // Reject
      if (status === 'rejected') {
        const updateStatus = {
          $set: {
            requestStatus: 'rejected',
            rejectedDate: new Date()
          }
        }
        const result = await requestsCollection.updateOne(query, updateStatus)
        return res.send(result)
      }

      // Approve
      if (status === 'approved') {
        const { requesterEmail, hrEmail, assetId } = request

        // Affiliation check 
        const existingAffiliation = await affiliationCollection.findOne({
          employeeEmail: requesterEmail,
          hrEmail: hrEmail
        })

        if (!existingAffiliation) {
          // New Employee ---> Check Package limit
          const hrUser = await usersCollection.findOne({email: hrEmail})
          const currentEmployees = hrUser.currentEmployees || 0
          const packageLimit = hrUser.packageLimit || 0

          if(currentEmployees >= packageLimit) {
            // HR needs to upgrade package
            return res.send({message: "Limit Reached", error: true})
          }

          // If Limit is ok : Create affiliation
          await affiliationCollection.insertOne({
            employeeEmail: requesterEmail,
            hrEmail: hrEmail,
            companyName: hrUser.companyName,
            companyLogo: hrUser.companyLogo,
            role: 'employee',
            joinDate: new Date()
          })

          // Update HR's employee count
          await usersCollection.updateOne(
            {email: hrEmail},
            {$inc: {currentEmployees: 1}}
          )

          // Update request status approved
          const updateStatus = {
            $set: {
              requestStatus: 'approved',
              approvedDate: new Date()
            }
          }
          const requestResult = await requestsCollection.updateOne(query, updateStatus)

          // Reduce asset quantity 
          if(assetId){
            const assetQuery = {_id: new ObjectId(assetId)}
            const updateAsset = {
              $inc: {productQuantity: -1}
            }
            await assetsCollection.updateOne(assetQuery, updateAsset)
          }

          return res.send(requestResult)
        }
      }
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`AssetVerse server is runner on port: ${port}`);
})