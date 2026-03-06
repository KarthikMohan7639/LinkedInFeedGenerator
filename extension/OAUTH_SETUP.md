# Setting up OAuth Consent Screen for Google Cloud Platform

This document guides you through setting up the OAuth consent screen in the Google Cloud Platform, which is necessary for using Google APIs like Gmail and Google Sheets.

## Steps:

1.  **Go to the Google Cloud Console:**
    *   Open your web browser and navigate to the [Google Cloud Console](https://console.cloud.google.com/).
    *   If you have not already, log in with your Google account.

2.  **Select or Create a Project:**
    *   In the top navigation bar, click on the project dropdown.
    *   Select an existing project or click on **"New Project"** to create a new one.
    *   If you create a new project, give it a name and follow the on-screen instructions.

3.  **Navigate to APIs & Services > OAuth consent screen:**
    *   In the left-hand navigation menu (the "hamburger" icon), go to **"APIs & Services"** and then select **"OAuth consent screen"**.

4.  **Choose User Type:**
    *   You will be asked to choose a **User Type**.
    *   For development and testing, you can select **"External"** and add your own email as a test user.
    *   If your application is for internal use within a Google Workspace organization, you can select **"Internal"**.
    *   Click **"Create"**.

5.  **Fill in App Information:**
    *   **App name:** Enter the name of your application. This will be shown to users on the consent screen.
    *   **User support email:** Select your email address.
    *   **App logo:** (Optional) Upload a logo for your application.
    *   **Developer contact information:** Enter an email address for Google to contact you.
    *   Click **"Save and Continue"**.

6.  **Configure Scopes:**
    *   Scopes allow your application to request access to specific user data.
    *   Click on **"Add or Remove Scopes"**.
    *   Based on the APIs you are using, you will need to add the relevant scopes. For this extension, you will likely need scopes for Gmail and Google Sheets.
        *   **Google Sheets API:** `https://www.googleapis.com/auth/spreadsheets`
        *   **Gmail API:** `https://www.googleapis.com/auth/gmail.send` (and/or other Gmail scopes)
    *   Select the required scopes and click **"Update"**.
    *   After adding the scopes, click **"Save and Continue"**.

7.  **Add Test Users:**
    *   While your app is in testing, you can only grant access to a limited number of test users.
    *   Click on **"Add Users"** and enter the email addresses of your test users (including your own).
    *   Click **"Save and Continue"**.

8.  **Review and Save:**
    *   Review the summary of your OAuth consent screen configuration.
    *   Click **"Back to Dashboard"**.

Your OAuth consent screen is now configured. You can now proceed to create credentials (like an OAuth 2.0 Client ID) to use in your application.
