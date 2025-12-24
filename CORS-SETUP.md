# Configuración CORS para Despliegue en Vercel

## Problema Identificado
El error de CORS ocurre porque el dominio del frontend no está incluido en la lista de orígenes permitidos.

## Solución

### 1. Variables de Entorno en Vercel
Asegúrate de configurar las siguientes variables de entorno en tu dashboard de Vercel:

```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://vasoliweb-production.up.railway.app,https://vasoliltdaapi.vercel.app,https://tu-frontend-domain.vercel.app
MONGO_URI=tu-mongo-connection-string
SMTP_USER=tu-email@dominio.com
SMTP_PASS=tu-password
LOG_LEVEL=info
```

### 2. Agregar tu Dominio Frontend
Reemplaza `https://tu-frontend-domain.vercel.app` con el dominio real de tu aplicación frontend.

### 3. Verificación
Después del despliegue, puedes verificar los logs de Vercel para ver si los requests CORS están siendo procesados correctamente.

### 4. Headers CORS Incluidos
La configuración ahora incluye:
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Credentials`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`
- `Vary: Origin`

### 5. Debugging
Si estableces `LOG_LEVEL=debug`, verás información detallada sobre los requests y orígenes en los logs de Vercel.

## Cambios Realizados

1. **Actualizado CORS origins**: Incluido el dominio de Vercel API
2. **Mejorados headers CORS**: Agregados headers adicionales necesarios
3. **Mejor manejo de errores**: Logging más detallado de problemas CORS
4. **Validación de base de datos**: Verificación de conexión antes de usar
5. **Headers de preflight**: Configuración mejorada para requests OPTIONS

## Testing
Puedes probar la configuración CORS con:

```javascript
fetch('https://vasoliltdaapi.vercel.app/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'test@test.com',
    password: 'password'
  })
})
```

El error 500 también debería estar resuelto con la verificación de conexión a la base de datos.