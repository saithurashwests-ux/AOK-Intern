// 1) Create a Firebase project, enable Google sign-in, Firestore and Storage.
// 2) Copy your Firebase Web App config from Firebase Console into this file.
// 3) Set adminEmail to the exact Google email that should see the Admin Board.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};

export const adminEmail = "YOUR_GOOGLE_EMAIL@gmail.com";
