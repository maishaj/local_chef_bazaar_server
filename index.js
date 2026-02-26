const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");
//const serviceAccount = require("./local-chef-bazaar-firebase-adminsdk.json");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//Middleware
app.use(cors());
app.use(express.json());
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
};

const verifyAdmin = async (req, res, next) => {
    const email = req.decoded_email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    const isAdmin = user?.role === 'admin';
    if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access: Admins Only" });
    }
    next();
};

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.listen(port, () => {
  //console.log(`Local Chef Bazzar is listening on port ${port}`);
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
    //await client.connect();

    const db = client.db("chef_bazaar_db");
    //collections
    const usersCollection = db.collection("users");
    const mealsCollection = db.collection("meals");
    const reviewsCollection = db.collection("reviews");
    const newsletterCollection = db.collection("newsletter");
    const favCollection = db.collection("favourites");
    const ordersCollection = db.collection("orders");
    const roleRequestCollection = db.collection("roleRequests");
    const paymentsCollection = db.collection("payments");
    


    //users API
    app.post("/users", async (req, res) => {
    const user = req.body;
    const query = { email: user.email };

    const existingUser = await usersCollection.findOne(query);
    if (existingUser) {
      return res.send({ message: "User already exists", insertedId: null });
    }

    const newUser = {
      ...user,
      status: "active",
      role: "user",
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.send(result);
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/users/fraud/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "fraud",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      if (email) {
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access!" });
        }
      }
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/:email/role", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.patch("/users/address/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const { address } = req.body;
      const query = { email: email };
      const updatedInfo = {
        $set: {
          address: address,
        },
      };
      const result = await usersCollection.updateOne(query, updatedInfo);
      res.send(result);
    });

    //role request API
    app.post("/request-role", verifyFBToken, async (req, res) => {
      const roleReq = req.body;
      const query = {
        email: roleReq.email,
        requestType: roleReq.requestType,
        requestStatus: roleReq.requestStatus,
      };
      const exists = await roleRequestCollection.findOne(query);
      if (exists) {
        return res.send({
          message: `You already sent a request to be an ${roleReq.requestType}`,
        });
      }
      const result = await roleRequestCollection.insertOne(roleReq);
      res.send(result);
    });

    app.get("/request-role", verifyFBToken, async (req, res) => {
      const cursor = roleRequestCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/admin/role-request/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const { status, userEmail, requestType } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedInfo = {
        $set: {
          requestStatus: status,
        },
      };
      await roleRequestCollection.updateOne(query, updatedInfo);
      if (status === "approved") {
        const userQuery = { email: userEmail };
        let updateDoc = {
          $set: { role: requestType },
        };

        if (requestType === "chef") {
          const randomID = Math.floor(1000 + Math.random() * 9000);
          updateDoc.$set.chefId = `chef-${randomID}`;
        }
        const result = await usersCollection.updateOne(userQuery, updateDoc);
        return res.send(result);
      }
      res.send({ message: "Request Rejected" });
    });

    app.get("/admin-stats", verifyFBToken, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const pendingOrders = await ordersCollection.countDocuments({
          orderStatus: "Pending",
        });
        const deliveredOrders = await ordersCollection.countDocuments({
          orderStatus: "Delivered",
        });
        const revenueStats = await ordersCollection
          .aggregate([
            {
              $match: { price: { $exists: true } },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: { $toDouble: "$price" } },
              },
            },
          ])
          .toArray();

        const totalRevenue =
          revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;

        res.send({
          totalUsers,
          pendingOrders,
          deliveredOrders,
          totalRevenue,
        });
      } catch (error) {
        console.error("Stats Error:", error);
        res
          .status(500)
          .send({ message: "Internal Server Error", error: error.message });
      }
    });

    //meals API
    app.get("/meals", async (req, res) => {
      const cursor = mealsCollection.find().sort({ foodRating: -1 }).limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/meals", verifyFBToken, async (req, res) => {
      const mealInfo = req.body;
      const result = await mealsCollection.insertOne(mealInfo);
      res.send(result);
    });

    app.get("/all-meals", async (req, res) => {
    const { order, limit = 0, skip = 0, search = "", area = "", rating = "" } = req.query;

    const query = {
      foodName: { $regex: search, $options: "i" }
    };

    if (area) {
      query.deliveryArea = area;
    }

    if (rating) {
      query.foodRating = { $gte: Number(rating) };
    }

    const sortValue = order === "asc" ? 1 : -1;

    const cursor = mealsCollection
      .find(query)
      .limit(Number(limit))
      .skip(Number(skip))
      .sort({ foodPrice: sortValue });

    const result = await cursor.toArray();
    const count = await mealsCollection.countDocuments(query);

    res.send({ meals: result, totalCount: count });
    });

    app.get("/meal-details/:id", verifyFBToken, async (req, res) => {
      const food = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      res.send(result);
    });

    app.get("/meals/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const cursor = mealsCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/related-meals", async (req, res) => {
    try {
        const area = req.query.area;
        const currentId = req.query.id;
        const query = {
            deliveryArea: area,
            _id: { $ne: new ObjectId(currentId) } 
        };
        const cursor = mealsCollection.find(query).limit(4);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching related meals:", error);
        res.status(500).send({ message: "Failed to fetch related meals" });
     }
    });

    app.patch("/meals/:id", verifyFBToken, async (req, res) => {
      const info = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          foodName: info.mealName,
          chefName: info.chefName,
          foodPrice: parseFloat(info.price),
          foodRating: parseFloat(info.rating),
          ingredients: info.ingredients,
          foodDetails: info.details,
          deliveryArea: info.deliveryArea,
          estimatedDeliveryTime: info.deliveryTime,
          chefsExperience: info.experience,
        },
      };
      const result = await mealsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.delete("/meals/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.deleteOne(query);
      res.send(result);
    });

    //reviews API
    app.get("/reviews", async (req, res) => {
      const cursor = reviewsCollection.find().sort({ date: -1 }).limit(4);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/reviews/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { reviewerEmail: email };
      const cursor = reviewsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/review/:foodId", verifyFBToken, async (req, res) => {
      const foodId = req.params.foodId;
      const query = { foodId: foodId };
      const cursor = reviewsCollection.find(query).sort({ date: -1 }).limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/reviews", verifyFBToken, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.delete("/reviews/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/reviews/update/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const review = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedInfo = {
        $set: {
          rating: review.rating,
          comment: review.comment,
        },
      };
      const result = await reviewsCollection.updateOne(query, updatedInfo);
      res.send(result);
    });
    
    app.get("/admin/reviews",async (req, res) => {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
    });


    app.delete("/admin/reviews/:id",async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
    });

    //newsletter API
    app.post("/newsletter", async (req, res) => {
      const info = req.body;
      const email = info.email;
      const emailexists = newsletterCollection.findOne({ email });
      if (emailexists) {
        return res.send({ message: "User exists!" });
      }
      const result = await newsletterCollection.insertOne(info);
      res.send(result);
    });

    //favourites
    app.post("/favourites", verifyFBToken, async (req, res) => {
      const favInfo = req.body;

      const mealId = req.body.mealId;
      const query = { mealId };
      const exists = await favCollection.findOne(query);
      if (exists) {
        return res.send({ message: "Already exists in your favourites!" });
      }

      const result = favCollection.insertOne(favInfo);
      res.send(result);
    });

    app.get("/favourites/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const cursor = favCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/favourites/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await favCollection.deleteOne(query);
      res.send(result);
    });

    //Order API
    app.post("/order", verifyFBToken, async (req, res) => {
      const orderInfo = req.body;
      orderInfo.orderTime = new Date();
      const result = await ordersCollection.insertOne(orderInfo);
      res.send(result);
    });

    app.get("/order/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const cursor = ordersCollection.find(query).sort({ orderTime: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/orderRequest/:chefEmail", verifyFBToken, async (req, res) => {
      const chefEmail = req.params.chefEmail;
      const query = { chefEmail: chefEmail };
      const cursor = ordersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/order/status/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const { orderStatus } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedData = {
        $set: {
          orderStatus: orderStatus,
        },
      };
      const result = await ordersCollection.updateOne(query, updatedData);
      res.send(result);
    });

    
    //Payment (Stripe) related APIS
    app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.mealName,
              },
            },
            quantity: paymentInfo.quantity,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          orderId: paymentInfo.orderId,
          foodId: paymentInfo.foodId,
          customer_email: paymentInfo.userEmail,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    app.post("/confirm-payment", verifyFBToken, async (req, res) => {
      const { sessionId } = req.body;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          const { orderId, customer_email, foodId } = session.metadata;
          const paymentRecord = {
            transactionId: session.payment_intent,
            amount: session.amount_total / 100,
            userEmail: customer_email,
            foodId: foodId,
            date: new Date(),
          };

          const paymentResult =
            await paymentsCollection.insertOne(paymentRecord);

          const query = { _id: new ObjectId(orderId) };
          const updatedInfo = {
            $set: {
              paymentStatus: "paid",
              transactionId: session.payment_intent,
            },
          };
          const result = await ordersCollection.updateOne(query, updatedInfo);
          res.send(result);
        }
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
  } finally {
    //await client.close();
  }
}
run().catch(console.dir);
