# 📧 Configuración de Notificaciones por Email

## Descripción
La aplicación ahora envía notificaciones por email automáticamente cuando se recibe un mensaje desde la aplicación.

## Requisitos
- Cuenta de email (Gmail o Hostinger)
- Datos SMTP del servidor de correo

## Instrucciones de Configuración

### OPCIÓN 1: Gmail

#### 1. Obtener la Contraseña de Aplicación

1. Ve a tu cuenta de Google: https://myaccount.google.com
2. En el menú lateral, ve a **"Seguridad"**
3. Habilita **"Verificación en dos pasos"** si aún no lo has hecho
4. Luego busca **"Contraseñas de aplicación"** (aparece después de habilitar 2FA)
5. Selecciona **App: Mail** y **Device: Windows/Mac/Linux**
6. Copia la contraseña de 16 caracteres que se genera

#### 2. Crear archivo `.env`

```
EMAIL_USER=Altoquepadel@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

---

### OPCIÓN 2: Hostinger (Recomendado para tu caso)

#### 1. Obtener datos SMTP desde Hostinger

1. Inicia sesión en tu panel de control de Hostinger
2. Ve a **Email** o **Correo electrónico**
3. Busca tu email `info@altoquepadel.com`
4. Haz clic en **Configurar** o **Settings**
5. Busca la sección **SMTP** o **Configuración SMTP**
6. Encontrarás algo como:
   ```
   Servidor SMTP: mail.altoquepadel.com
   Puerto: 465 (SSL) o 587 (TLS)
   Usuario: info@altoquepadel.com
   Contraseña: (la contraseña que configuraste para este email)
   ```

#### 2. Crear archivo `.env`

```
EMAIL_USER=info@altoquepadel.com
EMAIL_PASSWORD=tu_contraseña_del_email_aqui
EMAIL_HOST=mail.altoquepadel.com
EMAIL_PORT=465
EMAIL_SECURE=true
```

**Notas importantes:**
- Si tu Hostinger usa puerto **587**, cambia `EMAIL_SECURE=false`
- El archivo `.env` NO debe subirse al repositorio
- En desarrollo local puedes deixar los datos, en producción usa variables de ambiente

---

### 3. Instalar Dependencias

```bash
npm install
```

Esto instalará `nodemailer` automáticamente.

## Cómo Funciona

Cuando se envía un mensaje desde la aplicación de configuración:

1. El mensaje se guarda en el archivo JSON (como antes)
2. **NUEVO:** Se envía automáticamente un email a:
   - info@altoquepadel.com
   - Altoquepadel@gmail.com

El email incluye:
- ✉️ Ubicación/Club de origen
- ⏰ Hora exacta del mensaje
- 📝 Contenido del mensaje
- Formato HTML profesional

## Endpoint API

**Ruta:** `POST /api/enviar_feedback`

**Body:**
```json
{
  "raspy_id": "RASPY_001",
  "club": "La Esquina",
  "mensaje": "Hola, tengo un problema con las pulseras"
}
```

**Respuesta:**
```json
{
  "mensaje": "Feedback registrado exitosamente",
  "emailEnviado": true
}
```

## Solución de Problemas

### Error: "Invalid login credentials"
- Verifica que estés usando la contraseña correcta
- En Gmail: debe ser contraseña de aplicación, no la contraseña de la cuenta
- En Hostinger: usa la contraseña del email

### Error: "Connection refused" o "Cannot reach server"
- Verifica que el host y puerto sean correctos
- Comprueba que el puerto SMTP no esté bloqueado en tu red
- Intenta cambiar puerto a 587 en lugar de 465

### El email no se envía pero no hay errores
- Revisa los logs de la consola del servidor
- Verifica tu conexión a internet
- Comprueba que las credenciales sean correctas

### En Hostinger: "SMTP not enabled"
- Ve a Email > tu cuenta > Settings
- Verifica que SMTP esté **habilitado**
- Algunos planes de hosting lo tienen deshabilitado por defecto

## Personalización

Para cambiar los destinatarios, edita esta línea en `server.js`:

```javascript
const destinatarios = [
  'info@altoquepadel.com',
  'Altoquepadel@gmail.com',
  'otro_email@ejemplo.com'  // Agregar más si quieres
];
```

Para cambiar el formato del email, edita la sección HTML en la función `enviarEmailNotificacion()`.

## Seguridad

✅ Las credenciales se cargan desde variables de ambiente
✅ El `.env` está en `.gitignore` (no se sube a repositorio)
✅ Si el email falla, NO detiene la operación principal
✅ Los errores se registran en la consola pero no rompen la aplicación
✅ Los emails se envían de forma asincrónica (no bloquea la respuesta)
