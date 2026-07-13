const https = require('https');
const fs = require('fs');
const path = require('path');

const libs = [
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
        dest: 'public/gsap.min.js'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
        dest: 'public/ScrollTrigger.min.js'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js',
        dest: 'public/three.min.js'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/motion@11.11.13/dist/motion.js',
        dest: 'public/motion.js'
    }
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded ${dest} successfully.`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function run() {
    for (const lib of libs) {
        try {
            console.log(`Downloading ${lib.url}...`);
            await download(lib.url, lib.dest);
        } catch (e) {
            console.error(`Error downloading ${lib.url}:`, e.message);
        }
    }
}

run();
