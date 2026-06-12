const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth Plugin එක enable කිරීම (Bot Detection එක නැති කරනවා)
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Browser Instance එකක් හදන එක (මේකෙන් Speed එක වැඩි වෙනවා)
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
        // Browser එකේ User-Agent එක සරලම එකක් ලෙස සෙට් කිරීම
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        console.log(`🔍 Searching: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // සර්ච් රිසල්ට් වල පළවෙනි මූවී එකේ Link එක ගන්නවා
        const moviePageUrl = await page.evaluate(() => {
            const firstArticle = document.querySelector('article a');
            return firstArticle ? firstArticle.href : null;
        });

        if (!moviePageUrl) return null;

        // මූවී එකේ Title එකත් ගමු
        const title = await page.evaluate(() => {
            const firstTitle = document.querySelector('article .title a, article h2 a, article h3 a');
            return firstTitle ? firstTitle.innerText.trim() : 'Unknown Movie';
        });

        return { title, moviePageUrl };
    } catch (error) {
        console.error("Search Error:", error.message);
        return null;
    } finally {
        await page.close(); // Page එක වැසීම (Memory Save කරනවා)
    }
}

// 📥 2. මූවී පේජ් එකට ගිහින් Pixeldrain Link එක ගන්න එක
async function scrapePixeldrain(pageUrl) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`📥 Visiting Movie Page: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // පේජ් එකේ ඇතුළෙ තියෙන හැම Link එකක්ම චෙක් කරනවා
        const downloadLink = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            
            // Pixeldrain ලින්ක් එකක් තියෙනවද බලන්නවා
            const pdLink = links.find(a => a.href && a.href.includes('pixeldrain.com'));
            
            if (pdLink) {
                // ලින්ක් එක /u/ වගේම ආවොත් ඒක Direct Download එකක් බවට හරවනවා
                let href = pdLink.href;
                if (href.includes('/u/')) {
                    return href.replace('/u/', '/api/file/') + '?download';
                }
                return href; // ඒක වෙනත් ෆෝමැට් එකක ආවොත් ඒ විදිහටම
            }
            return null;
        });

        return downloadLink;
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

    const downloadLink = await scrapePixeldrain(movieInfo.moviePageUrl);
    if (!downloadLink) {
        return res.json({ 
            status: false, 
            message: `"${movieInfo.title}" චිත්‍රපටය හමු විය, නමුත් Pixeldrain ලින්ක් එකක් හමු වූයේ නැත. (සයිට් එකේ Shortlink හෝ වෙනත් ආරක්ෂාවක් තියෙන්න පුළුවන්)` 
        });
    }

    res.json({
        status: true,
        title: movieInfo.title,
        downloadLink: downloadLink
    });
});

// Server Start කිරීම
app.listen(PORT, () => {
    console.log(`🚀 Sinhalasub Scraper API running on http://localhost:${PORT}`);
});
