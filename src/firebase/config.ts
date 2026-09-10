import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCov1Uzb-TxRV5F1rn-j0QVof_avNxErGM",
  authDomain: "login-cmr.firebaseapp.com",
  databaseURL: "https://login-cmr-default-rtdb.firebaseio.com",
  projectId: "login-cmr",
  storageBucket: "login-cmr.firebasestorage.app",
  messagingSenderId: "1048641311850",
  appId: "1:1048641311850:web:27c0db48a4c64a3b282613"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "default");
export default app;
