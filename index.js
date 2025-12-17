const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("AssetVerse_DB")
    const usersCollection = db.collection('users')


    app.get('/assets', (req, res) => {
      res.send("Inside Mongo DB")
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