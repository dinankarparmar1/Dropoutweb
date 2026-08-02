import { db } from "../firebase.js";

import {
collection,
query,
orderBy,
getDocs
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const container = document.getElementById("daily-analysis-container");

async function loadAnalysis() {

    container.innerHTML = "";

    const q = query(
        collection(db, "dailyAnalysis"),
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    snapshot.forEach(doc => {

        const data = doc.data();

        container.innerHTML += `
        <div class="analysis-card">

            <img src="${data.image}" alt="${data.stock}">

            <div class="content">

                <span class="signal ${data.signal.toLowerCase()}">
                    ${data.signal}
                </span>

                <h3>${data.stock}</h3>

                <p>${data.title}</p>

                <div class="targets">

                    <span>🎯 ${data.target}</span>

                    <span>🛑 ${data.stoploss}</span>

                </div>

                <a href="analysis.html?id=${doc.id}">
                    Read Full Analysis →
                </a>

            </div>

        </div>
        `;

    });

}

loadAnalysis();
