fetch('companies.json')
  .then(response => response.json())
  .then(companies => {
    const searchInput = document.getElementById('searchInput');

    searchInput.addEventListener('keyup', function () {
      const value = this.value.toLowerCase();

      const match = companies.find(c =>
        c.name.toLowerCase().includes(value) ||
        c.symbol.toLowerCase().includes(value)
      );

      if (match && value.length > 1) {
        window.location.href = `company.html?stock=${match.symbol}`;
      }
    });
  });
