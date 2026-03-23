# SLU-QR Student Profiling System

A system for student profiling and tracking using QR codes.

## Setup Instructions

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Configure environment variables:**
    *   Copy `.env.example` and rename it to `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Open `.env` and fill in your Supabase and Brevo credentials.
4.  Run the development server:
    ```bash
    npm start
    ```

## Security Note

**NEVER** upload your `.env` file or commit it to Git. The `.env` file is listed in `.gitignore` to prevent accidental disclosure of secret keys.