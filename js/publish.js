import { db, storage } from "../firebase.js";

import {
collection,
addDoc,
serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
ref,
uploadBytes,
getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

const image=document.getElementById("image");
const preview=document.getElementById("preview");

image.addEventListener("change",()=>{

const file=image.files[0];

if(file){

preview.src=URL.createObjectURL(file);

preview.style.display="block";

}

});

document.querySelector(".publish").onclick=async()=>{

const file=image.files[0];

if(!file){

alert("Select Image");

return;

}

const stock=document.getElementById("stock").value;

const title=document.getElementById("title").value;

const signal=document.getElementById("signal").value;

const entry=document.getElementById("entry").value;

const target=document.getElementById("target").value;

const stoploss=document.getElementById("stoploss").value;

const description=document.getElementById("description").value;

const fileName=Date.now()+"_"+file.name;

const storageRef=ref(storage,"analysis/"+fileName);

await uploadBytes(storageRef,file);

const imageUrl=await getDownloadURL(storageRef);

await addDoc(collection(db,"dailyAnalysis"),{

stock,

title,

signal,

entry,

target,

stoploss,

description,

image:imageUrl,

createdAt:serverTimestamp()

});

alert("Analysis Published Successfully");

location.reload();

};
