import { db } from "../firebase.js";

import {
collection,
query,
orderBy,
startAt,
endAt,
getDocs
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const search = document.getElementById("searchStock");
const container = document.getElementById("analysisContainer");

search.addEventListener("input", async () => {

const text = search.value.toUpperCase();

const q = query(
collection(db, "analysis"),
orderBy("stock"),
startAt(text),
endAt(text + "\uf8ff")
);

const snap = await getDocs(q);

container.innerHTML = "";

snap.forEach((docItem) => {

const d = docItem.data();

container.innerHTML += `

<div class="analysis-card">

<img src="${d.image}">

<div class="content">

<div class="signal ${d.signal.toLowerCase()}">

${d.signal}

</div>

<h3>${d.stock}</h3>

<h4>${d.title}</h4>

<a href="analysis.html?id=${docItem.id}">

View Analysis →

</a>

</div>

</div>

`;

});

});
