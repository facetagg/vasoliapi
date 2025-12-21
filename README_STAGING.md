Objetivo
- Desplegar una instancia "staging" de la API en Vercel para pruebas de frontend.

Resumen rápido
1. Crear un proyecto en Vercel llamado `vasoliapi-staging` (puede usarse la interfaz o la CLI).
2. Configurar las variables de entorno (MONGO_URI, CORS_ORIGINS, etc.) en el proyecto de Vercel.
3. Desplegar con Vercel CLI o conectar el repositorio para despliegues automáticos desde una rama.

Pasos detallados
1) Instalar Vercel CLI (si no lo tienes):

```bash
npm install -g vercel
```

2) Login en Vercel:

```bash
vercel login
```

3) En la carpeta del proyecto, linkear o crear el proyecto de staging:

```bash
# Inicia el asistente y elige "Create a new Project" -> escribe vasoliapi-staging
vercel link
# —o—
vercel --name vasoliapi-staging
```

4) Configurar variables de entorno (recomendado desde el Dashboard):
- Entra en https://vercel.com -> tu equipo -> vasoliapi-staging -> Settings -> Environment Variables
- Añade las variables listadas en `.env.staging.example` bajo el entorno `Production` o `Preview` según prefieras.

Alternativa CLI para añadir una variable:

```bash
vercel env add MONGO_URI production
# te pedirá el valor
```

5) Asegúrate de incluir el dominio del frontend de staging en `CORS_ORIGINS` (ej: `https://mi-frontend-staging.vercel.app`).

6) Desplegar:

```bash
# Despliegue interactivo (pedirá confirmación)
vercel --confirm

# Despliegue no interactivo con token (útil en CI)
VERCEL_TOKEN=xxxxxx vercel --confirm --token $VERCEL_TOKEN
```

Notas sobre entornos y ramas
- Puedes usar un proyecto separado `vasoliapi-staging` y marcar sus despliegues como "production" para ese proyecto; así mantienes `vasoliapi` para producción.
- Alternativamente, usa las Deploy Previews que Vercel crea por cada PR/branch; en ese caso configura variables en la sección `Preview`.

CORS y pruebas frontend
- El backend ya respeta la variable `CORS_ORIGINS`. Añade el dominio del frontend staging allí para permitir llamadas desde el navegador.

Siguientes pasos sugeridos (opcionales)
- Añadir un archivo `.vercelignore` para excluir archivos grandes si es necesario.
- Crear un script de GitHub Actions para desplegar automáticamente a `vasoliapi-staging` cuando se haga push a `staging` branch.

Si quieres, puedo:
- Crear un `vercel-staging.json` de ejemplo con rutas específicas.
- Generar un workflow de GitHub Actions que despliegue a Vercel cuando haya push a `staging`.
