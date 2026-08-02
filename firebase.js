import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQJhuaeHY3aikwOzsOYvg8Z0aI_CgyF20",
  authDomain: "dropoutweb-45665.firebaseapp.com",
  projectId: "dropoutweb-45665",
  storageBucket: "dropoutweb-45665.firebasestorage.app",
  messagingSenderId: "270914825019",
  appId: "1:270914825019:web:39d9fa6f107c7b7aa7651e",
  measurementId: "G-2QY84BH322"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
