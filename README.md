# Funga-Deal

## Overview
**Funga-Deal** is a secure digital escrow and agreement management platform designed to bridge the trust gap in online marketplaces. It provides a structured workflow for buyers and sellers to initiate, track, and close deals with verified milestones and integrated payment security.

## Project Structure
This repository is organized as a **Monorepo**:
* **/frontend**: Next.js 15 application (UI, Dashboard, and Clerk Auth).
* **/backend**: Node.js/Express services handling core transaction logic and API integrations.

---

## Tech Stack

### Frontend & UI
* **Framework:** Next.js 15 (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS & Lucide React (Icons)
* **Authentication:** Clerk (Middleware protected routes)

### Backend & Database
* **Server:** Node.js / Express
* **Database:** [Neon](https://neon.tech) (Serverless PostgreSQL)
* **ORM:** Drizzle ORM (Type-safe database operations)
* **Communication:** Axios for frontend-to-backend API calls

---

## Getting Started

### Prerequisites
Ensure you have the following installed:
* **Node.js:** v20.x or higher
* **npm:** v10.x or higher
* **Git**

### Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/derrickgitonga/Funga-Deal.git](https://github.com/derrickgitonga/Funga-Deal.git)
    cd Funga-Deal
    ```

2.  **Install Frontend Dependencies:**
    *Note: We use `--legacy-peer-deps` to align Next.js 15 and Clerk versions and avoid dependency conflicts.*
    ```bash
    cd frontend
    npm install --legacy-peer-deps
    ```

3.  **Install Backend Dependencies:**
    ```bash
    cd ../backend
    npm install
    ```

### Environment Configuration
Create a `.env.local` file in the `/frontend` directory:

```env
# Database (Neon Connection String)
DATABASE_URL="postgresql://user:password@ep-cool-darkness-123.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:5000