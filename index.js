const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET)

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
    const assignedAssetsCollection = db.collection('assignedAssets')
    const paymentCollection = db.collection('payments')
    const packageCollection = db.collection('packages')

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
    
    app.get('/users/role/:email', verifyToken, async (req, res) => {
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
          packageLimit: userData.packageLimit,
          currentEmployees: 0,
          subscription: userData.subscription
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
    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    // Update user profile
    app.patch('/users/:email', verifyToken, async (req, res) => {
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
    app.post('/assets', verifyToken, async (req, res) => {
      const assetData = req.body
      assetData.dateAdded = new Date()
      assetData.productQuantity = parseInt(assetData.productQuantity)
      assetData.availableQuantity = parseInt(assetData.availableQuantity)

      const result = await assetsCollection.insertOne(assetData)
      res.send(result)
    })

    // Get Assets with filtered, search, pagination
    app.get('/assets', verifyToken, async (req, res) => {
      const email = req.query.email
      const company = req.query.company;
      const search = req.query.search || ""
      const filterType = req.query.filter || ""
      const sortOrder = req.query.sort || ""


      // Base query
      let query = {
        productName: { $regex: search, $options: 'i' }
      }

      if (email) {
        query.hrEmail = email;
      } else if (company) {
        // EMPLOYEE VIEW: Show assets belonging to this Company
        query.companyName = company;
      }

      // Filter
      if (filterType) {
        query.productType = filterType
      }

      // Pagination
      const page = parseInt(req.query.page) || 0
      const limit = parseInt(req.query.limit) || 10
      const skip = page * limit

      // Sort options
      let options = {}
      if (sortOrder === 'asc') options.sort = { productQuantity: 1 }
      if (sortOrder === 'desc') options.sort = { productQuantity: -1 }

      const cursor = assetsCollection.find(query, options).skip(skip).limit(limit)

      const totalCount = await assetsCollection.countDocuments(query)

      if (limit > 0) {
        cursor.skip(skip).limit(limit)
      }

      const result = await cursor.toArray()
      res.send({ result, count: totalCount });
    })

    // Delete Asset
    app.delete('/assets/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await assetsCollection.deleteOne(query)
      res.send(result)
    })

    // Update Asset
    app.patch('/assets/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const data = req.body
      const query = { _id: new ObjectId(id) }

      const existingAsset = await assetsCollection.findOne(query)

      if (!existingAsset) {
        return res.status(404).send({ message: "Asset not found" })
      }

      const newQuantity = parseInt(data.productQuantity)
      const oldQuantity = parseInt(existingAsset.productQuantity)
      const difference = newQuantity - oldQuantity

      const currentAssigned = oldQuantity - existingAsset.availableQuantity;

      if (newQuantity < currentAssigned) {
        return res.status(400).send({ message: "Cannot reduce quantity. Items are currently assigned to employees." });
      }

      const updatedDoc = {
        $set: {
          productName: data.productName,
          productType: data.productType,
          productImage: data.productImage,
          productQuantity: newQuantity,
          lastUpdate: new Date(),
        },
        $inc: {
          availableQuantity: difference
        }
      }
      const result = await assetsCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    // Request API

    // Employee requests Assets
    app.post('/requests', verifyToken, async (req, res) => {
      const request = req.body

      const asset = await assetsCollection.findOne({ _id: new ObjectId(request.assetId) })

      if (!asset) {
        return res.status(404).send({ message: "Asset not found" })
      }
      if (asset.availableQuantity <= 0) {
        return res.status(404).send({ message: "Asset is out of stock" })
      }

      const newRequest = {
        ...request,
        requestDate: new Date(),
        requestStatus: 'pending',
        approvalDate: null,
      }

      const result = await requestsCollection.insertOne(newRequest)
      res.send(result)
    })

    // Get requests 
    app.get('/requests', verifyToken, async (req, res) => {
      const { email, hrEmail, search } = req.query

      let query = {}

      if (email) {
        query.requesterEmail = email

        if (search) {
          query.assetName = { $regex: search, $options: 'i' }
        }
      } else if (hrEmail) {
        query.hrEmail = hrEmail

        if (search) {
          query.$or = [
            { requesterName: { $regex: search, $options: 'i' } },
            { requesterEmail: { $regex: search, $options: 'i' } },
            { assetName: { $regex: search, $options: 'i' } },
          ]
        }
      }

      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const skip = page * limit;

      const result = await requestsCollection
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ requestDate: -1 })
        .toArray()

      const count = await requestsCollection.countDocuments(query)

      res.send({ result, count })
    })

    // Asset request Accept or Reject (HR Only)
    app.patch('/requests/:id', verifyToken, async (req, res) => {
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
        const { requesterEmail, hrEmail, assetId, requesterName } = request

        // Affiliation check 
        const existingAffiliation = await affiliationCollection.findOne({
          employeeEmail: requesterEmail,
          hrEmail: hrEmail
        })

        if (!existingAffiliation) {
          // New Employee ---> Check Package limit
          const hrUser = await usersCollection.findOne({ email: hrEmail })
          const currentEmployees = hrUser.currentEmployees || 0
          const packageLimit = hrUser.packageLimit || 0

          // Check Package limit
          if (currentEmployees >= packageLimit) {
            // HR needs to upgrade package
            return res.send({ message: "Limit Reached", error: true })
          }

          // If Limit is ok : Create affiliation
          await affiliationCollection.insertOne({
            employeeEmail: requesterEmail,
            employeeName: requesterName,
            hrEmail: hrEmail,
            companyName: hrUser.companyName,
            companyLogo: hrUser.companyLogo,
            role: 'employee',
            affiliationDate: new Date(),
            status: "active"
          })

          // Update HR's employee count
          await usersCollection.updateOne(
            { email: hrEmail },
            { $inc: { currentEmployees: 1 } }
          )

          // Update request status approved
          const updateStatus = {
            $set: {
              requestStatus: 'approved',
              approvedDate: new Date()
            }
          }
          const requestResult = await requestsCollection.updateOne(query, updateStatus)

          // INSERT INTO assignedAssets COLLECTION
          const assignedAssetDoc = {
            requestId: new ObjectId(id), // Link to original request
            assetId: new ObjectId(assetId),
            assetName: request.assetName,
            assetImage: request.assetImage,
            assetType: request.assetType,
            employeeEmail: requesterEmail,
            employeeName: request.requesterName,
            hrEmail: hrEmail,
            companyName: request.companyName,
            assignmentDate: new Date(),
            returnDate: null, // null if not returned
            status: "assigned"
          }

          await assignedAssetsCollection.insertOne(assignedAssetDoc)

          // Reduce asset quantity 
          if (assetId) {
            const assetQuery = { _id: new ObjectId(assetId) }
            const updateAsset = {
              $inc: { availableQuantity: -1 }
            }
            await assetsCollection.updateOne(assetQuery, updateAsset)
          }

          return res.send(requestResult)
        } else {
          // update the request status
          const updateStatus = {
            $set: {
              requestStatus: 'approved',
              approvedDate: new Date()
            }
          }
          const requestResult = await requestsCollection.updateOne(query, updateStatus)

          // INSERT INTO assignedAssets COLLECTION
          const assignedAssetDoc = {
            requestId: new ObjectId(id),
            assetId: new ObjectId(assetId),
            assetName: request.assetName,
            assetImage: request.assetImage,
            assetType: request.assetType,
            employeeEmail: requesterEmail,
            employeeName: request.requesterName,
            hrEmail: hrEmail,
            companyName: request.companyName,
            assignmentDate: new Date(),
            returnDate: null,
            status: "assigned"
          }
          await assignedAssetsCollection.insertOne(assignedAssetDoc)

          // Reduce asset quantity
          if (assetId) {
            const assetQuery = { _id: new ObjectId(assetId) }
            const updateAsset = {
              $inc: { availableQuantity: -1 } // Or availableQuantity depending on your schema
            }
            await assetsCollection.updateOne(assetQuery, updateAsset)
          }

          return res.send(requestResult)
        }
      }

    })

    // My Employees
    app.get('/my-employees', verifyToken, async (req, res) => {
      const { email, search } = req.query

      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const skip = page * limit;

      try {

        const hrUser = await usersCollection.findOne(
          { email: email },
          { projection: { packageLimit: 1 } }
        );
        const packageLimit = hrUser?.packageLimit || 0;

        const pipeline = [
          {
            $match: { hrEmail: email }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'employeeEmail',
              foreignField: 'email',
              as: 'user'
            }
          },
          {
            $unwind: '$user'
          },
          {
            $lookup: {
              from: 'assignedAssets',
              let: { eEmail: '$employeeEmail' },
              pipeline: [
                {
                  $match: {
                    $and: [
                      { $expr: { $eq: ['$employeeEmail', '$$eEmail'] } },
                      { status: "assigned" }
                    ]
                  }
                }
              ],
              as: 'assets'
            }
          },
          {
            $project: {
              _id: 1,
              name: '$user.name',
              email: '$user.email',
              image: '$user.userPhoto',
              role: '$user.role',
              dateOfBirth: '$user.dateOfBirth',
              joinDate: '$joinDate',
              assetsCount: { $size: '$assets' },
            }
          }
        ]
        if (search) {
          pipeline.push({
            $match: {
              $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
              ]
            }
          });
        }

        pipeline.push({
          $facet: {
            metadata: [{ $count: "totalCount" }],
            data: [{ $skip: skip }, { $limit: limit }]
          }
        })

        const result = await affiliationCollection.aggregate(pipeline).toArray();

        const totalCount = result[0].metadata[0]?.totalCount || 0;
        const employees = result[0].data;

        res.send({ result: employees, count: totalCount, packageLimit: packageLimit });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server Error" });
      }
    })

    // My Team
    app.get('/team-members', verifyToken, async (req, res) => {
      const { email, hrEmail } = req.query

      try {
        const isAffiliated = await affiliationCollection.findOne({
          employeeEmail: email,
          hrEmail: hrEmail,
        })
        console.log(isAffiliated);
        if (!isAffiliated) {
          return res.status(403).send({ message: "Access Forbidden" })
        }
        const result = await affiliationCollection.aggregate([
          {
            $match: { hrEmail: hrEmail }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'employeeEmail',
              foreignField: 'email',
              as: 'user'
            }
          },
          { $unwind: '$user' },
          {
            $project: {
              name: '$user.name',
              email: '$user.email',
              image: '$user.userPhoto',
              role: '$role',
              dateOfBirth: '$user.dateOfBirth'
            }
          }
        ]).toArray();

        //  Fetch the HR (Admin) Profile
        const hrUser = await usersCollection.findOne({ email: hrEmail });
        const hrAsMember = {
          name: hrUser?.name || "Admin",
          email: hrUser?.email,
          image: hrUser?.profileImage,
          role: 'admin',
          dateOfBirth: hrUser?.dateOfBirth
        };

        res.send([hrAsMember, ...result])

      } catch (err) {
        console.error(err);
      }
    })

    // Helper: Get My Affiliated Companies (To populate the Tabs/Dropdown)
    app.get('/my-affiliations', verifyToken, async (req, res) => {
      const { email } = req.query;
      const affiliations = await affiliationCollection.find({ employeeEmail: email }).toArray();

      // Return only the company info needed for tabs
      const companies = affiliations.map(aff => ({
        companyName: aff.companyName,
        companyLogo: aff.companyLogo,
        hrEmail: aff.hrEmail,
        _id: aff._id
      }));

      res.send(companies);
    });

    // Return an Asset (PATCH Method)
    app.patch('/assets/return/:id', verifyToken, async (req, res) => {
      const { id } = req.params; // The ID of the assignedAsset document
      const { assetId } = req.body; // The ID of the main asset (to increase stock)

      // 1. Mark as returned in 'assignedAssets' collection
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'returned',
          returnDate: new Date()
        }
      };

      const result = await assignedAssetsCollection.updateOne(filter, updateDoc);

      // 2. If successful, Increase Stock in 'assets' collection
      if (result.modifiedCount > 0) {
        const assetFilter = { _id: new ObjectId(assetId) };
        const updateStock = {
          $inc: { availableQuantity: 1 }
        };
        await assetsCollection.updateOne(assetFilter, updateStock);
      }

      res.send(result);
    });

    // ---------Payment-----------

    // GET: Payment History for a specific HR
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { hrEmail: req.params.email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/create-checkout-session', verifyToken, async (req, res) => {
      const { price, packageName, employeeLimit, hrEmail } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: hrEmail, // Auto-fill user email on Stripe
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${packageName} Package`,
                description: `Up to ${employeeLimit} employees`,
              },
              unit_amount: price * 100, // Amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        // Redirect URLs (Frontend)
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
        // Save critical data in metadata so we can read it later
        metadata: {
          hrEmail,
          packageName,
          employeeLimit,
          price
        }
      });

      res.send({ sessionId: session.id, url: session.url });
    });

    app.post('/validate-payment', verifyToken, async (req, res) => {
      const { sessionId } = req.body;
      console.log(sessionId);
      // A. Retrieve session from Stripe to verify it's actually paid
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        const { hrEmail, packageName, employeeLimit, price } = session.metadata;
        const transactionId = session.payment_intent;

        // B. Save Payment Info
        const paymentData = {
          hrEmail,
          packageName,
          employeeLimit: parseInt(employeeLimit),
          amount: parseInt(price),
          transactionId,
          paymentDate: new Date(),
          status: 'completed'
        };

        // Prevent duplicate entry (Optional check)
        const alreadySaved = await paymentCollection.findOne({ transactionId });
        if (alreadySaved) {
          return res.send({ success: true, message: "Already saved" });
        }

        const paymentResult = await paymentCollection.insertOne(paymentData);

        // C. Update User Limit
        const updateDoc = {
          $set: {
            packageLimit: parseInt(employeeLimit),
            subscription: packageName,
            transactionId
          }
        };
        const updateResult = await usersCollection.updateOne({ email: hrEmail }, updateDoc);

        res.send({ success: true, paymentResult, updateResult });
      } else {
        res.status(400).send({ success: false, message: "Payment not verified" });
      }
    });


    // Get Packages
    app.get('/packages', async (req, res) => {

      const result = await packageCollection.find().toArray()
      res.send(result)
    })

    // Get My Assets
    app.get('/my-assets', verifyToken, async (req, res) => {
      const { email, search, type } = req.query;

      // 1. Pagination Logic
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const skip = page * limit;

      // 2. Build Query
      // Strict Filter: Only show assets belonging to the logged-in employee
      let query = { employeeEmail: email };

      // Search by Asset Name
      if (search) {
        query.assetName = { $regex: search, $options: 'i' };
      }

      // Filter by Type (Returnable / Non-returnable)
      if (type) {
        query.assetType = type;
      }

      // Optional: Filter out returned items if you only want to show current assets
      // query.status = "assigned"; 

      try {
        // 3. Fetch Data from 'assignedAssets' collection
        const result = await assignedAssetsCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        // 4. Get Total Count (for Pagination)
        const count = await assignedAssetsCollection.countDocuments(query);

        res.send({ result, count });
      } catch (error) {
        console.error("Error fetching my assets:", error);
        res.status(500).send({ message: "Error fetching assets" });
      }
    });


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