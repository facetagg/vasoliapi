const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Colección donde están los flujos/tareas
const WORKFLOW_COLLECTION = "flujos";

// Middleware simple para asegurar que hay conexión a la BD
function ensureDb(req, res, next) {
    if (!req.db) {
        return res.status(503).json({ error: 'Servicio no disponible: no hay conexión a la base de datos (MONGO_URI no configurado).' });
    }
    next();
}

// Aplicar al router: todas las rutas requieren DB
router.use(ensureDb);

// 1) Obtener departamento a partir de un email
// URL: GET /api/workflows/department-by-email/:email
router.get('/department-by-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (!email) return res.status(400).json({ error: "Email requerido" });

        const usuario = await req.db.collection('usuarios').findOne(
            { mail: email },
            { projection: { departamento: 1, empresa: 1, nombre: 1 } }
        );

        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        const departamento = usuario.departamento || usuario.empresa || null;

        return res.json({ email, departamento, nombre: usuario.nombre });
    } catch (err) {
        console.error("Error en department-by-email:", err);
        res.status(500).json({ error: "Error interno al obtener departamento" });
    }
});

// 2) Obtener tareas/flujos a partir de un departamento (acepta ObjectId o nombre)
// URL: GET /api/workflows/tasks-by-department/:dept
router.get('/tasks-by-department/:dept', async (req, res) => {
    try {
        const { dept } = req.params;
        if (!dept) return res.status(400).json({ error: "Departamento requerido" });

        let query = {};

        if (ObjectId.isValid(dept)) {
            const objId = new ObjectId(dept);
            query = {
                $or: [
                    { departmentId: objId },
                    { departamentoId: objId },
                    { departamento: dept }
                ]
            };
        } else {
            const re = new RegExp(dept, 'i');
            query = {
                $or: [
                    { departamento: dept },
                    { departamento: { $regex: re } },
                    { departmentName: { $regex: re } },
                    { ownerDepartment: { $regex: re } }
                ]
            };
        }

        const tareas = await req.db.collection(WORKFLOW_COLLECTION).find(query).toArray();
        res.json({ count: tareas.length, tareas });
    } catch (err) {
        console.error("Error en tasks-by-department:", err);
        res.status(500).json({ error: "Error interno al obtener tareas por departamento" });
    }
});

// 3) Combinado: obtener tareas a partir del email (busca departamento y luego tareas)
// URL: GET /api/workflows/tasks-by-email/:email
router.get('/tasks-by-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (!email) return res.status(400).json({ error: "Email requerido" });

        // 1. Buscar Usuario para obtener el nombre del departamento
        const usuario = await req.db.collection('usuarios').findOne(
            { mail: email },
            { projection: { departamento: 1, empresa: 1 } }
        );

        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

        const nombreDepartamento = usuario.departamento || usuario.empresa;
        if (!nombreDepartamento) return res.status(404).json({ error: "Departamento no definido para el usuario" });

        // 2. Buscar el documento del Departamento para obtener su _id
        // Usamos Regex para ignorar mayúsculas/minúsculas
        const departamentDoc = await req.db.collection("departamentos").findOne({
            name: { $regex: new RegExp(`^${nombreDepartamento}$`, 'i') }
        });

        if (!departamentDoc) return res.status(404).json({ error: `Departamento '${nombreDepartamento}' no existe en la DB` });

        const targetDeptId = departamentDoc._id.toString(); // El ID que buscamos en los nodos

        console.log(`Buscando tareas para Dept: ${nombreDepartamento} (ID: ${targetDeptId})`);

        // 3. Buscar Workflows y filtrar nodos específicos
        // Paso A: Encontrar workflows que tengan AL MENOS un nodo con ese department ID
        const workflows = await req.db.collection(WORKFLOW_COLLECTION).find({
            "nodes.department": targetDeptId
        }).toArray();

        // Paso B: Extraer solo los nodos (tareas) que coincidan.
        // La consulta de Mongo devuelve el documento entero, necesitamos filtrar el array 'nodes' con JS.
        let tareasEncontradas = [];
        let startDate = null;
        workflows.forEach(workflow => {
            startDate = workflow.createdAt || null;
            // Filtramos los nodos internos que pertenecen a este departamento
            const nodosDelDepto = workflow.nodes.filter(node => 
                node.department === targetDeptId && node.type === 'task' // Opcional: asegurar que sea tipo tarea
            );

            // Agregamos info del workflow padre por si la necesitas en el frontend
            const nodosConContexto = nodosDelDepto.map(node => ({
                ...node,
                workflowName: workflow.name,
                workflowId: workflow._id
            }));

            tareasEncontradas = [...tareasEncontradas, ...nodosConContexto];
        });

        res.json({ 
            departamento: departamentDoc.name, 
            departamentoId: targetDeptId,
            startDate: startDate || null,
            count: tareasEncontradas.length, 
            tareas: tareasEncontradas 
        });

    } catch (err) {
        console.error("Error en tasks-by-email:", err);
        res.status(500).json({ error: "Error interno al obtener tareas por email" });
    }
});

// 4) Obtener un flujo por su ID (completo)
// URL: GET /api/tareas/:id
router.get('/:id', async (req, res) => {
    try {
        const workflowId = req.params.id;

        if (!ObjectId.isValid(workflowId)) {
            return res.status(400).json({ error: 'ID de flujo no válido.' });
        }

        const workflow = await req.db.collection(WORKFLOW_COLLECTION).findOne({ _id: new ObjectId(workflowId) });

        if (!workflow) {
            return res.status(404).json({ error: 'Flujo no encontrado.' });
        }

        res.json(workflow);
    } catch (err) {
        console.error('Error al obtener flujo por id en /tareas:', err);
        res.status(500).json({ error: 'Error interno al obtener flujo' });
    }
});


module.exports = router;