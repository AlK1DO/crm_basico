# BigData CRM

Plataforma web para gestión y análisis de datasets CSV. Permite cargar archivos, limpiar datos y generar reportes con gráficas interactivas. El acceso está protegido mediante autenticación OTP por correo electrónico.

---

## Tecnologías

| Tecnología | Uso |
|---|---|
| React 19 + TypeScript | Framework principal |
| Vite 8 | Bundler y servidor de desarrollo |
| Firebase Auth | Manejo de sesión (`signInAnonymously`) |
| EmailJS | Envío del código OTP por correo |
| PapaParse | Parseo de archivos CSV |
| Recharts | Gráficas interactivas |
| React Router v8 | Navegación y rutas protegidas |
| React Toastify | Notificaciones |
| CSS Modules | Estilos por componente |

---

## Flujo de autenticación

```
Ingresa correo
     ↓
Genera OTP de 6 dígitos (en memoria)
     ↓
EmailJS envía el código al correo
     ↓
Usuario ingresa el código
     ↓
Validación: existe · no expirado (10 min) · un solo uso
     ↓
signInAnonymously(Firebase) → acceso al CRM
```

- El OTP se almacena únicamente en memoria del frontend
- No se usa Firestore ni ninguna base de datos para el OTP
- Al cerrar sesión los datasets se eliminan de localStorage

---

## Funcionalidades

- **Datasets** — Carga uno o varios archivos CSV por drag & drop o selección. Vista previa de los primeros 10 registros.
- **Limpieza** — Elimina duplicados, filas vacías, normaliza espacios y texto. Descarga el CSV limpio.
- **Reportes** — Genera gráficas de barras, líneas o pastel a partir de cualquier dataset cargado. Incluye estadísticas (suma, promedio, mínimo, máximo, mediana).

---

## Instalación local

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Iniciar en desarrollo
npm run dev
```

---

## Variables de entorno

Crea un archivo `.env` en la raíz con las siguientes variables:

```env
VITE_EMAILJS_SERVICE_ID=tu_service_id
VITE_EMAILJS_TEMPLATE_ID=tu_template_id
VITE_EMAILJS_PUBLIC_KEY=tu_public_key
```

> El archivo `.env` está incluido en `.gitignore` y nunca debe subirse al repositorio.

---

## Deploy en Vercel

1. Sube el código a GitHub
2. Conecta el repositorio en [vercel.com](https://vercel.com)
3. Selecciona la rama a deployar
4. En **Settings → Environment Variables** agrega las 3 variables `VITE_*`
5. Deploy

El archivo `vercel.json` ya está configurado para que el routing de React funcione correctamente en Vercel.

---

## Scripts disponibles

```bash
npm run dev       # Servidor de desarrollo
npm run build     # Build de producción
npm run preview   # Vista previa del build
npm run lint      # Linter
```

---

## Estructura del proyecto

```
src/
├── context/        # AuthContext, DatasetContext
├── firebase/       # config, emailService, otpService
├── hooks/          # useAuth, useDatasets
├── layouts/        # DashboardLayout, Mainlayout
├── pages/
│   ├── auth/       # Login, OtpVerification
│   └── dashboard/  # DashboardHome, Datasets, DataCleaning, Reports
├── routers/        # AppRoutes, ProtectedRoute
└── utils/          # firebaseError
```
