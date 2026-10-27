// Import the functions you need from the SDKs you need
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { deleteUser, EmailAuthProvider, getReactNativePersistence, initializeAuth, reauthenticateWithCredential, updatePassword, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDHAnJCZWeFURLqvPyDtjiMJyPxsvA4vwM",
  authDomain: "tcc2-843c9.firebaseapp.com",
  projectId: "tcc2-843c9",
  storageBucket: "tcc2-843c9.firebasestorage.app",
  messagingSenderId: "745592084704",
  appId: "1:745592084704:web:cc950cc7816469cce6d885"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app,{persistence:getReactNativePersistence(ReactNativeAsyncStorage)});
export const db = getFirestore(app);
export async function updateUser({ user, password }: { user: any; password: string }) {
  try {
    if (user) {
      await updatePassword(user, password);
      console.log("Password updated successfully");
    } else {
      console.error("No user is currently signed in.");
    }
  } catch (error) {
    console.error("Error updating password:", error);
  }
};
export async function deleteUserAccount(user: User, password: string) {
  if (!user.email) {
    throw new Error("A conta autenticada não possui um email para reautenticação.");
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await deleteUser(user);
}