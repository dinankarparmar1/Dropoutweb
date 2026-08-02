import { db, storage } from "../firebase.js";

import {
collection,
addDoc,
doc,
getDoc,
updateDoc,
serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
ref,
uploadBytes,
getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

const params = new URLSearchParams(location.search);
const editId = params.get("id");

const stock = document.getElementById("stock");
const title = document.getElementById("title");
const signal = document.getElementById("signal");
const entry = document.getElementById("entry");
const target = document.getElementById("target");
const stoploss = document.getElementById("stoploss");
const description = document.getElementById("description");
const image = document.getElementById("image");

if (editId) {

const snap = await getDoc(doc(db, "analysis", editId));

if (snap.exists()) {

const d = snap.data();

stock.value = d.stock || "";
title.value = d.title || "";
signal.value = d.signal || "BUY";
entry.value = d.entry || "";
target.value = d.target || "";
stoploss.value = d.stoploss || "";
description.value = d.description || "";

}

}

document.querySelector(".publish").onclick = async () => {

let imageURL = "";

if (image.files.length) {

const file = image.files[0];

const storageRef = ref(storage, "analysis/" + Date.now() + "_" + file.name);

await uploadBytes(storageRef, file);

imageURL = await getDownloadURL(storageRef);

}

const data = {

stock: stock.value,
title: title.value,
signal: signal.value,
entry: entry.value,
target: target.value,
stoploss: stoploss.value,
description: description.value,
image: imageURL,
updatedAt: serverTimestamp()

};

if (editId) {

await updateDoc(doc(db, "analysis", editId), data);

alert("Analysis Updated");

} else {

data.createdAt = serverTimestamp();
data.views = 0;

await addDoc(collection(db, "analysis"), data);

alert("Analysis Published");

}

location.href = "dashboard.html";

};
