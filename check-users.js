const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkUsers() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Conectado a MongoDB');
    
    const db = client.db('Vasoli');
    const usuarios = db.collection('usuarios');
    
    // Contar total de usuarios
    const count = await usuarios.countDocuments();
    console.log(`Total de usuarios: ${count}`);
    
    // Obtener algunos usuarios de muestra
    const sampleUsers = await usuarios.find({}).limit(5).toArray();
    console.log('Usuarios de muestra:');
    sampleUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.nombre} - ${user.mail} - Estado: ${user.estado}`);
    });
    
    // Verificar estados de usuarios
    const estados = await usuarios.aggregate([
      { $group: { _id: '$estado', count: { $sum: 1 } } }
    ]).toArray();
    
    console.log('\nUsuarios por estado:');
    estados.forEach(estado => {
      console.log(`${estado._id}: ${estado.count}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Conexión cerrada');
  }
}

checkUsers();