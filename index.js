const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");

//Middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.listen(port, () => {
  console.log(`Local Chef Bazzar is listening on port ${port}`);
});

const uri = `mongodb+srv://${process.env.DBUser}:${process.env.DBPassword}@cluster0.fjenzci.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db=client.db('chef_bazaar_db');
    //collections
    const usersCollection=db.collection('users');

    app.post('/users',async (req,res)=>{
      const user=req.body;

      user.status='active';
      user.role='user';
      user.createdAt=new Date();

      const result=await usersCollection.insertOne(user);
      res.send(result);
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);
