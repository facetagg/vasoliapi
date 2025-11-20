// historialTest.js
import { MongoClient } from "mongodb";

const uri = "mongodb://root:secret123@localhost:27017/?authSource=admin";

let client;

async function conectarDB() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    console.log(" Conectado a MongoDB");
  }
  return client.db("historialDB");
}

// -------------------------------------------------------
// Función que registra un historial en MongoDB con parámetros
// -------------------------------------------------------

export async function registrarHistorial(db,
titulo, areaTrabajo, descripcion) {
    const db = await conectarDB();
    const historial = db.collection("historial");

    const data = {
      titulo,
      areaTrabajo,
      descripcion,
      fecha: new Date()
    };

    const result = await historial.insertOne(data);

    console.log(" Historial registrado con ID:", result.insertedId);
    return { data_historial: data, modifiedCount: result.modifiedCount };


}

// --------------------------------------------------------------------
// Si ejecutas el archivo directamente, toma parámetros desde la consola
// node historialTest.js "titulo" "area" "descripcion"
// --------------------------------------------------------------------
if (process.argv[1].includes("historialTest.js")) {
  const [titulo, areaTrabajo, descripcion] = process.argv.slice(2);

  if (!titulo || !areaTrabajo || !descripcion) {
    console.log(" Uso: node historialTest.js \"titulo\" \"areaTrabajo\" \"descripcion\"");
    process.exit(1);
  }

  registrarHistorial(titulo, areaTrabajo, descripcion);
}
