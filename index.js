require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

// Importar rutas
const authRoutes = require("./endpoints/auth");
const flujos = require("./endpoints/flujos");
const departments = require("./endpoints/departments");
const mailRoutes = require("./endpoints/mail");
const gen = require("./endpoints/Generador");
const noti = require("./endpoints/notificaciones");
const menu = require("./endpoints/web");
const plantillas = require("./endpoints/plantillas");
const historial = require("./endpoints/historial");
const googleDrive = require("./endpoints/googleDrive");



const app = express();
//actualizando


// 🔑 APLICAR EL MIDDLEWARE DE CORS CON LAS OPCIONES
app.use(cors());

app.use(express.json());

// Configurar conexión a MongoDB (desde variable de entorno)
let client;
let db;
if (process.env.MONGO_URI) {
  client = new MongoClient(process.env.MONGO_URI);
}

async function connectDB() {
  if (!process.env.MONGO_URI) return null;
  if (!db) {
    await client.connect();
    db = client.db("Vasoli");
    console.log("Conectado a MongoDB");
  }
  return db;
}

// Middleware para inyectar la base de datos en cada request (si está configurada)
app.use(async (req, res, next) => {
  try {
    if (!process.env.MONGO_URI) {
      req.db = null;
      return next();
    }
    req.db = await connectDB();
    next();
  } catch (err) {
    console.error("Error al conectar con MongoDB:", err);
    res.status(500).json({ error: "Error con base de datos" });
  }
});

// Rutas listas
app.use("/api/auth", authRoutes);
app.use("/api/workflows", flujos);
app.use("/api/departments", departments);
app.use("/api/mail", mailRoutes);
app.use("/api/noti", noti);

//rutas sin uso
app.use("/api/menu", menu);
app.use("/api/plantillas", plantillas);
app.use("/api/generador", gen);
app.use("/api/historial", historial);
app.use("/api/drive", googleDrive);


// Ruta base
app.get("/", (req, res) => {
  res.json({ message: "API funcionando" });
});

// Exportar la app para que Vercel la maneje como serverless function
module.exports = app;