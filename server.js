const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth Plugin එක enable කිරීම (Bot Detection එක නැති කරනවා)
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

let browserInstance;

async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browserInstance;
}

// 🔍 1. සයිට් එක Search කරලා මූවී එකේ URL එක ගන්න එක
async function searchMovie(query) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        console.log(`🔍 Searching: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // සාමාන්‍යයෙන් මේ සයිට් වල මූවී ලින්ක්ස් වලට 'post-item' හෝ 'post-title' වගේ classes තියෙනවා
        const moviePageUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const movieLink = links.find(a => {
                const href = a.href || '';
                // Category, Tag, Page වගේ ඒවා බැහැර කරලා සාමාන්‍ය මූවී ලින්ක් එක ගන්නවා
                return href.includes('sinhalasub.lk/') && 
                       !href.includes('/category/') && 
                       !href.includes('/tag/') && 
                       !href.includes('/page/') && 
                       !href.includes('/?s=') &&
                       href !== 'https://sinhalasub.lk/' &&
                       href !== 'https://sinhalasub.lk';
            });
            return movieLink ? movieLink.href : null;
        });

        if (!moviePageUrl) return null;

        const title = await page.evaluate(() => {
            const h2 = document.querySelector('h2 a, h3 a, .post-title a');
            return h2 ? h2.innerText.trim() : 'Unknown Movie';
        });

        return { title, moviePageUrl };
    } catch (error) {
        console.error("Search Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 📥 2. මූවී පේජ් එකට ගිහින් Direct CDN Links ගන්න එක
async function scrapeDownloadLinks(pageUrl) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`📥 Visiting Movie Page: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // පේජ් එකේ ඇතුළෙ තියෙන හැම Link එකක්ම චෙක් කරනවා
        const downloadLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const results = [];
            
            links.forEach(a => {
                const href = a.href || '';
                const text = a.innerText || '';
                
                // අපිට ඕනේ cdn.sinhalasub.net වලින් පටන් ගන්නා Direct Download ලින්ක්ස්
                if (href.includes('cdn.sinhalasub.net') || href.includes('.mp4')) {
                    let quality = 'Unknown';
                    
                    // Link එකේ Text එකෙන් Quality එක හොයාගන්නවා (උදා: 1080p, 720p)
                    if (text.includes('1080') || text.toLowerCase().includes('fhd')) quality = 'FHD 1080p';
                    else if (text.includes('720') || text.toLowerCase().includes('hd')) quality = 'HD 720p';
                    else if (text.includes('480') || text.toLowerCase().includes('sd')) quality = 'SD 480p';
                    
                    // URL එකෙන්ම Quality එක හොයාගන්නවා (Text එකේ නැතිනම්)
                    if (quality === 'Unknown') {
                        if (href.includes('1080')) quality = 'FHD 1080p';
                        else if (href.includes('720')) quality = 'HD 720p';
                        else if (href.includes('480')) quality = 'SD 480p';
                    }

                    results.push({
                        quality: quality,
                        download_url: href
                    });
                }
            });

            // Duplicate ලින්ක්ස් ඉවත් කිරීම
            const uniqueResults = [];
            const seenUrls = new Set();
            results.forEach(item => {
                if (!seenUrls.has(item.download_url)) {
                    seenUrls.add(item.download_url);
                    uniqueResults.push(item);
                }
            });

            return uniqueResults;
        });

        return downloadLinks;
    } catch (error) {
        console.error("Scraping Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 🌐 3. API Endpoint එක
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;
    
    if (!movieName) {
        return res.status(400).json({ status: false, error: "කරුණාකර මූවී එකේ නම ඇතුළත් කරන්න. (?name=movie_name)" });
    }

    console.log(`🎬 Request received for: ${movieName}`);
    
    const movieInfo = await searchMovie(movieName);
    if (!movieInfo) {
        return res.json({ status: false, message: "කණගාටුයි, එම චිත්‍රපටය හමු වූයේ නැත." });
    }

    const downloadLinks = await scrapeDownloadLinks(movieInfo.moviePageUrl);
    if (!downloadLinks || downloadLinks.length === 0) {
        return res.json({ 
            status: false, 
            message: `"${movieInfo.title}" චිත්‍රපටය හමු විය, නමුත් Direct Download ලින්ක්ස් හමු වූයේ නැත.` 
        });
    }

    // ඔයා දුන්නු API එකේ වගේම හරියටම JSON Response එකක් දෙනවා
    res.json({
        status: true,
        owner: "@heshan",
        title: movieInfo.title,
        result: downloadLinks
    });
});

// Server Start කිරීම
app.listen(PORT, () => {
    console.log(`🚀 Sinhalasub Scraper API running on http://localhost:${PORT}`);
});
