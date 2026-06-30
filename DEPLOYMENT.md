# Akana Naturals Deployment Guide

Welcome to the production deployment guide for Akana Naturals! The application is fully production-ready and configured to support dynamic database switching (MongoDB in production, JSON files in development) and secure payment processing.

---

## 1. Hosting Providers (Recommended)

Since the project is a standard Node.js Express server, it can be hosted for free or low-cost on the following platforms:
- **Render** (Recommended, very simple setup)
- **Railway**
- **Heroku**
- **Fly.io**

When deploying, set the **Build Command** to:
```bash
npm install
```
And set the **Start Command** to:
```bash
npm start
```

---

## 2. Environment Variables Configuration

To run the application in a live environment without fail, you must configure the following **Environment Variables** in your hosting provider's dashboard:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Mode of operation. Must be set to `production` in live environments. | `production` |
| `PORT` | The port the server binds to. Automatically handled by most hosting platforms. | `8080` (or leave default) |
| `ADMIN_PASSWORD` | Secure password to log into the Admin Dashboard (`/admin.html`). | *Choose a strong password!* |
| `MONGODB_URI` | Connection URI for persistent cloud database storage. | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `RAZORPAY_KEY_ID` | Your Razorpay API Key ID (Live or Test). | `rzp_live_abc123...` |
| `RAZORPAY_KEY_SECRET` | Your Razorpay API Key Secret (Live or Test). | `xyz789...` |
| `SMTP_HOST` | Outgoing mail server for order notifications. | `smtp.gmail.com` |
| `SMTP_PORT` | Outgoing mail server port. | `587` |
| `SMTP_USER` | Email address sending notifications. | `your-business-email@gmail.com` |
| `SMTP_PASS` | Password (or App Password) for sending emails. | *16-character Google App Password* |
| `ADMIN_EMAIL` | Destination email to receive notification of incoming orders. | `orders@akananaturals.com` |

---

## 3. Database Setup (MongoDB Atlas)

To prevent data loss (since cloud hosts have ephemeral file systems), you should set up a free persistent MongoDB database:

1. Sign up for a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free M0 Cluster.
3. Set up a database user and whitelist `0.0.0.0/0` (or allow connections from anywhere) in Network Access.
4. Click **Connect** → **Drivers** to retrieve your Connection String.
5. Replace `<password>` and `<username>` in the string and save it to the `MONGODB_URI` environment variable.
6. **Autoseeding**: On your first deploy, the server will connect to MongoDB, recognize that it's empty, and automatically seed it with the default products from `data/products.json` so the store is instantly populated.

---

## 4. Razorpay Setup (Payments)

1. Sign up/Log in at [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Settings** → **API Keys** → **Generate Key** (make sure you choose Live Mode or Test Mode as appropriate).
3. Copy the **Key ID** and **Key Secret** and add them to `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
4. Ensure `NODE_ENV` is set to `production` in your live server so that mock/unpaid transactions are strictly blocked.

---

## 5. SMTP Email Alerts Setup (Nodemailer)

To send email alerts to customers and yourself:
1. If using Gmail: Go to your Google Account Settings → Security → Enable **2-Step Verification**.
2. Search/Go to **App Passwords**.
3. Generate a new App Password named `Akana Naturals Store`.
4. Copy the generated 16-character code and paste it as `SMTP_PASS`.
5. Set `SMTP_USER` to your Gmail address and `SMTP_HOST` to `smtp.gmail.com`.
