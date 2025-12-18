const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
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
    const requestCollection = db.collection('requests')
    const affiliationCollection = db.collection('employeeAffiliations')
    const paymentCollection = db.collection('payments')

    // -----Middlewares-----
    
    // VerifyToken 
    const verifyToken = (req, res, next) => {
      if(!req.headers.authorization) {
        return res.status(401).send({message: 'unauthorized access'})
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
        if(err){
          return res.status(401).send({message: 'unauthorized access'})
        }
        req.decoded = decoded
        next()
      })
    }

    // Verify HR 
    const verifyHR = async(req, res, next)=>{
      const email = req.decoded.email
      const query = {email: email}
      const user = await usersCollection.findOne(query)
      const isHR = user?.role === 'hr'
      if(!isHR) {
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

    // Role checking ----VERIFYTOKEN Add korte hobe
    app.get('/users/role/:email', async(req, res)=> {
      const email = req.params.email

      // if(email !== req.decoded.email){
      //   return res.status(401).send({message: 'unauthorized access'}
      //   )
      // }

      const query = {email: email}
      const user = await usersCollection.findOne(query, {projection: {role: 1, _id: 0}})

      res.send({role: user?.role})
    })

    app.get('/users', async (req,res)=>{
      let query = {}
      const cursor = usersCollection.find(query)
      const result = await cursor.toArray() 
      res.send(result)
    })

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = {email: email}
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

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