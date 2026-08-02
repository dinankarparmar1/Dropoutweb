import { db } from "../firebase.js";

import {
collection,
getDocs,
deleteDoc,
doc
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const table = document.getElementById("tableBody");

async function loadPosts() {

table.innerHTML = "";

const snapshot = await getDocs(collection(db, "analysis"));

snapshot.forEach((item) => {

const data = item.data();

table.innerHTML += `

<tr>

<td>${data.stock}</td>

<td>${data.signal}</td>

<td>${data.date || "-"}</td>

<td>${data.views || 0}</td>

<td class="action">

<button class="edit" onclick="editPost('${item.id}')">

Edit

</button>

<button class="delete" onclick="deletePost('${item.id}')">

Delete

</button>

</td>

</tr>

`;

});

}

window.deletePost = async (id) => {

if (!confirm("Delete this analysis?")) return;

await deleteDoc(doc(db, "analysis", id));

loadPosts();

};

window.editPost = (id) => {

location.href = `admin.html?id=${id}`;

};

loadPosts();
