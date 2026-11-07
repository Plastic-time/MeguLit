const {migrate}=require('../services/store.cjs');
console.log(JSON.stringify(migrate(require('node:path').resolve(__dirname,'..'))));
