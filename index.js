const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require('stripe')(process.env.STRIPE_SECRET);

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
    const mealsCollection=db.collection('meals');
    const reviewsCollection=db.collection('reviews');
    const newsletterCollection=db.collection('newsletter');
    const favCollection=db.collection('favourites');
    const ordersCollection=db.collection('orders');
    const roleRequestCollection=db.collection('roleRequests');

    //users API
    app.post('/users',async (req,res)=>{
      const user=req.body;

      user.status='active';
      user.role='user';
      user.createdAt=new Date();

      const result=await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/:email',async(req,res)=>{
      const email=req.params.email;
      const query={email};
      const result=await usersCollection.findOne(query);
      res.send(result);
    })
    
    app.get('/users/:email/role',async(req,res)=>{
       const email=req.params.email;
       const query={email};
       const user=await usersCollection.findOne(query);
       res.send({role:user?.role || 'user'});
    })

    app.patch('/users/address/:email', async(req,res)=>{
       const email=req.params.email;
       const {address}=req.body;
       const query={email:email};
       const updatedInfo={
         $set:{
            address:address
         }
       }
       const result=await usersCollection.updateOne(query,updatedInfo);
       res.send(result);
    })

    //role request API
    app.post('/request-role',async(req,res)=>{
       const roleReq=req.body;
       const query={
         email:roleReq.email,
         requestType:roleReq.requestType,
         requestStatus:roleReq.requestStatus
       }
       const exists=await roleRequestCollection.findOne(query);
       if(exists)
       {
         return res.send({message:`You already sent a request to be an ${roleReq.requestType}`});
       }
       const result=await roleRequestCollection.insertOne(roleReq);
       res.send(result);
    })

    //meals API
    app.get('/meals', async (req,res)=>{
       const cursor=mealsCollection.find().sort({foodRating:-1}).limit(6);
       const result=await cursor.toArray();
       res.send(result);
    })

    app.post('/meals', async(req,res)=>{
       const mealInfo=req.body;
       const result=await mealsCollection.insertOne(mealInfo);
       res.send(result);
    })

    app.get('/all-meals', async (req,res)=>{

      //Sorting by price
       const {order="desc"}=req.query;
       const sortValue = order === "asc" ? 1 : -1;
       const cursor = mealsCollection.find().sort({ foodPrice: sortValue });

       const result=await cursor.toArray();
       res.send(result);
    })

    app.get('/meal-details/:id',async(req,res)=>{
      const food=req.body;
      const id=req.params.id;
      const query={ _id:new ObjectId(id)}; 
      const result=await mealsCollection.findOne(query);
      res.send(result);
    })

    //reviews API
    app.get('/reviews',async (req,res)=>{
      const cursor=reviewsCollection.find().sort({date:-1}).limit(4);
      const result=await cursor.toArray();
      res.send(result);
    })

    app.get('/reviews/:email',async(req,res)=>{
       const email=req.params.email;
       const query={reviewerEmail:email};
       const cursor=reviewsCollection.find(query);
       const result=await cursor.toArray();
       res.send(result);
    })

    app.get('/review/:foodId',async(req,res)=>{
      const foodId=req.params.foodId;
      const query={foodId:foodId};
      const cursor=reviewsCollection.find(query).sort({date:-1}).limit(8);
      const result=await cursor.toArray();
      res.send(result);
    })

    app.post('/reviews',async(req,res)=>{
      const review=req.body;
      const result=await reviewsCollection.insertOne(review);
      res.send(result);
    })

    app.delete('/reviews/:id',async(req,res)=>{
      const id=req.params.id;
      const query={ _id: new ObjectId(id)};
      const result=await reviewsCollection.deleteOne(query);
      res.send(result);
    })

    app.patch('/reviews/update/:id',async(req,res)=>{
      const id=req.params.id;
      const review=req.body;
      const query={_id:new ObjectId(id)};
      const updatedInfo={
        $set:{
           rating:review.rating,
           comment:review.comment
        }
      }
      const result=await reviewsCollection.updateOne(query,updatedInfo);
      res.send(result);
    })

    //newsletter API
    app.post('/newsletter',async (req,res)=>{
       const info=req.body;
       const email=info.email;
       const emailexists=newsletterCollection.findOne({email});
       if(emailexists)
       {
          return res.send({message:"User exists!"});
       }
       const result=await newsletterCollection.insertOne(info);
       res.send(result);
    })

    //favourites
    app.post('/favourites',async(req,res)=>{
       const favInfo=req.body;

       const mealId=req.body.mealId;
       const query={mealId};
       const exists=await favCollection.findOne(query);
       if(exists){
          return res.send({message:"Already exists in your favourites!"});
       }

       const result=favCollection.insertOne(favInfo);
       res.send(result);
    })

    app.get('/favourites/:email',async(req,res)=>{
       const email=req.params.email;
       const query={userEmail:email};
       const cursor=favCollection.find(query);
       const result=await cursor.toArray();
       res.send(result);
    })

   app.delete('/favourites/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)};
      const result=await favCollection.deleteOne(query);
      res.send(result);
   })

    //Order API
    app.post('/order', async(req,res)=>{
       const orderInfo=req.body;
       const result=await ordersCollection.insertOne(orderInfo);
       res.send(result);
    })

    app.get('/order/:email',async(req,res)=>{
       const email=req.params.email;
       const query={userEmail:email};
       const cursor=ordersCollection.find(query).sort({orderTime:-1});
       const result=await cursor.toArray();
       res.send(result);
    })

    //Payment (Stripe) related APIS
    app.post('/create-checkout-session', async (req, res) =>{
       const paymentInfo=req.body;
       const amount=parseInt(paymentInfo.price)*100;
       const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data:{
             currency:'BDT',
             unit_amount:amount,
             product_data:{
               name:paymentInfo.mealName
             }
            },
             quantity:paymentInfo.quantity,
          },
        ],
        customer_email:paymentInfo.userEmail,
        mode: 'payment',
        metadata:{   
          foodId:paymentInfo.foodId
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({url:session.url});
    });



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);
