import { db } from "../firebase.js";

import {
doc,
getDoc,
updateDoc,
increment
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("id");

const ref = doc(db, "analysis", id);

const snap = await getDoc(ref);

if (snap.exists()) {

const d = snap.data();

await updateDoc(ref, {
views: increment(1)
});

document.getElementById("analysisContent").innerHTML = `

<img src="${d.image}" class="hero-image">

<h1>${d.stock}</h1>

<h2>${d.title}</h2>

<div class="signal">${d.signal}</div>

<div class="price-grid">

<div>Entry<br><strong>₹${d.entry}</strong></div>

<div>Target<br><strong>₹${d.target}</strong></div>

<div>Stop Loss<br><strong>₹${d.stoploss}</strong></div>

</div>

<p>${d.description}</p>

`;

}
