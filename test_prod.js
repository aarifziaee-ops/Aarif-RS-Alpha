const fetch = require('node-fetch');

(async () => {
    try {
        const r = await fetch('http://localhost:3000/api/quote', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({symbols: ['AAPL']})
        });
        console.log("Status:", r.status);
        console.log("Body:", (await r.text()).substring(0, 50));
    } catch(e) {
        console.error(e);
    }
})();
