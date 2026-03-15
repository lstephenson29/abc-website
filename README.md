# ABC Website with Decap CMS

This is the Advanced Battery Concepts website with a built-in content management system (Decap CMS). You can edit all text and images through a browser-based admin panel at `yoursite.com/admin`.

## How It Works

- **Content** lives in JSON files under `/content/` (one per page)
- **Templates** in `/templates/` define the page structure
- **Build script** (`build.js`) combines content + templates into final HTML
- **Decap CMS** provides a visual editor at `/admin` to edit the JSON content files
- When you save changes in the admin panel, it commits to GitHub, which triggers Netlify to rebuild the site automatically

## Setup (One-Time, ~15 Minutes)

### Step 1: Create a GitHub Account (if you don't have one)

1. Go to [github.com](https://github.com) and sign up
2. Verify your email address

### Step 2: Create a New Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `abc-website`
3. Set it to **Private**
4. Click **Create repository**
5. Upload all the files from this project folder to the repository:
   - You can drag and drop all files on the GitHub page, or
   - Use the "uploading an existing file" link on the empty repo page
   - Make sure to upload the entire folder structure (admin/, content/, templates/, static/, build.js, package.json, netlify.toml)

### Step 3: Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) and sign up with your GitHub account
2. Click **Add new site** > **Import an existing project**
3. Choose **GitHub** and authorize Netlify
4. Select your `abc-website` repository
5. Netlify will auto-detect the build settings from `netlify.toml`:
   - Build command: `node build.js`
   - Publish directory: `dist`
6. Click **Deploy site**
7. Wait for the first deploy to finish (usually under 1 minute)

### Step 4: Enable Netlify Identity (Required for CMS Login)

1. In your Netlify site dashboard, go to **Site configuration** > **Identity**
2. Click **Enable Identity**
3. Under **Registration**, select **Invite only** (so only you can log in)
4. Under **External providers**, click **Add provider** > **Google** (optional, for easy login)
5. Go to **Site configuration** > **Identity** > **Services** > **Git Gateway**
6. Click **Enable Git Gateway**

### Step 5: Invite Yourself

1. Go to **Integrations** > **Identity** > **Invite users**
2. Enter your email address and send the invite
3. Check your email and click the invite link to set your password

### Step 6: Set Up Your Custom Domain (Optional)

1. In Netlify, go to **Domain management** > **Add custom domain**
2. Enter your domain (e.g., `advancedbatteryconcepts.com`)
3. Follow the DNS configuration instructions Netlify provides
4. Netlify will automatically provision an SSL certificate

## Editing Content

1. Go to `yoursite.netlify.app/admin` (or `yourdomain.com/admin`)
2. Log in with the email/password you set up in Step 5
3. Click on any page in the left sidebar
4. Edit text, swap images, update specs
5. Click **Publish** in the top right
6. The site automatically rebuilds in about 30 seconds

### What You Can Edit

- All headings and body text on every page
- Hero images and their alt text
- Spec values and labels
- Feature cards and descriptions
- Environment cards (images, temperatures, titles, descriptions)
- Comparison table rows
- Timeline entries on the About page
- Contact information
- SEO meta titles and descriptions

### Uploading New Images

1. In the admin panel, click the image field you want to change
2. Click **Choose an image** > **Upload**
3. Select the new image from your computer
4. The image will be uploaded to the `/assets/` folder in your repository

## Local Development

To preview changes locally before pushing:

```bash
# Install Node.js if you haven't (nodejs.org)

# Clone the repository
git clone https://github.com/YOUR-USERNAME/abc-website.git
cd abc-website

# Build the site
node build.js

# Preview (install serve globally once: npm install -g serve)
npx serve dist -l 3000
```

Then open `http://localhost:3000` in your browser.

## File Structure

```
abc-cms/
  admin/
    index.html          Decap CMS admin interface
    config.yml          CMS field definitions
  content/
    index.json          Homepage content
    technology.json     Technology page content
    applications.json   Deployments page content
    batterybarn.json    Battery Barn page content
    about.json          About page content
    contact.json        Contact page content
  templates/
    partials/
      header.html       Shared header/nav
      footer.html       Shared footer
    index.html          Homepage template
    technology.html     Technology template
    applications.html   Deployments template
    batterybarn.html    Battery Barn template
    about.html          About template
    contact.html        Contact template
  static/
    base.css            Base styles
    style.css           Site styles
    assets/             All images
  build.js              Build script (zero dependencies)
  netlify.toml          Netlify configuration
  package.json          Project metadata
```
