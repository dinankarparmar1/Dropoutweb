import { db } from "./firebase.js";

import {
collection,
query,
orderBy,
getDocs
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const container = document.getElementById("analysisContainer");

async function loadAnalysis() {

const q = query(
collection(db, "analysis"),
orderBy("createdAt", "desc")
);

const snapshot = await getDocs(q);

container.innerHTML = "";

snapshot.forEach((docItem) => {

const d = docItem.data();

container.innerHTML += `

<div class="analysis-card">

<img src="${d.image}" alt="${d.stock}">

<div class="content">

<div class="signal ${d.signal.toLowerCase()}">

${d.signal}

</div>

<h3>${d.stock}</h3>

<h4>${d.title}</h4>

<p>${d.description.substring(0,120)}...</p>

<div class="prices">

<span>Entry: ₹${d.entry}</span>

<span>Target: ₹${d.target}</span>

</div>

<a href="analysis.html?id=${docItem.id}" class="read-btn">

Read Analysis →

</a>

</div>

</div>

`;

});

}

loadAnalysis();
