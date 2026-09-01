// =====================================================
// PAKETİMVAR - FIREBASE.JS
// =====================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";


import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


import {
    getFirestore,
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    increment
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";



// =====================================================
// FIREBASE AYARLARI
// =====================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyATFYjrsncqTOGv6I660xxoI2rYtOr_DW4",

    authDomain:
        "paketimvarsamsun.firebaseapp.com",

    projectId:
        "paketimvarsamsun",

    storageBucket:
        "paketimvarsamsun.firebasestorage.app",

    messagingSenderId:
        "741800881382",

    appId:
        "1:741800881382:web:09c688a96d43292a171f27",

    measurementId:
        "G-39C1FCNGL2"

};



// =====================================================
// FIREBASE BAŞLAT
// =====================================================

const app =
    initializeApp(
        firebaseConfig
    );



const auth =
    getAuth(
        app
    );



const db =
    getFirestore(
        app
    );



// =====================================================
// DIŞARI AKTAR
// =====================================================

export {

    // Firebase
    app,
    auth,
    db,

    // Auth
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,

    // Firestore
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    increment

};