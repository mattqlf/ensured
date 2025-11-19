import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase.config.json";

const app = !getApps().length ?
  initializeApp(firebaseConfig) :
  getApp();

export const auth = getAuth(app);
export const googleProvider = new
  GoogleAuthProvider();
export const db =
  getFirestore(app);