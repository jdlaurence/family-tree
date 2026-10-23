# The Laurence–Chasen Family Tree

A small, elegant, password-gated family tree website. Everything lives in one file,
**`family.yaml`**, so stories and facts gathered from relatives have a permanent home.
There is no build step: edit the file, commit, and the site updates.

```
family.yaml     ← the archive: people, relationships, dates, bios, facts, stories
photos/         ← one photo per person (optional)
config.js       ← site title, password, start person
index.html, styles.css, src/, vendor/   ← the website itself (no need to touch)
```

## Turning it on (one time)

1. On GitHub open **Settings → Pages**.
2. Under **Build and deployment**, set *Source* to **Deploy from a branch**, pick the
   **`main`** branch and the **`/ (root)`** folder, then **Save**.
3. A minute later the site is live at `https://<your-username>.github.io/family-tree/`.

The default password is **`family`**. Change it right away (see below).

## Adding and editing people

Open `family.yaml` on GitHub, click the pencil icon, edit, and commit. Within a minute or two
the site reflects the change. Every push is checked automatically; if something is wrong
(a typo in an id, an unreadable date) the commit gets a red ✗ and the message explains what to fix.

Each person is one block under `people:`. Only `id` and `name` are required.

```yaml
  - id: lois-laurence                # short, lowercase, stable — never change it once set
    name: Lois Laurence              # full name
    birth_name: Shutz                # maiden / birth surname, shown as "née Shutz"
    nickname: Lo                     # shown in quotes; also used as the short name on the tree
    born: 1934-05-02                 # 1934 | 1934-05 | 1934-05-02 | "c. 1934"
    born_place: Erie, Pennsylvania
    died: 2019                       # leave out if living
    died_place: Pittsburgh
    photo: lois.jpg                  # a file in photos/
    parents: [henry-shutz, mary-shutz]
    spouses:
      - id: ronald-laurence
        married: 1958                # optional; "divorced:" and "widowed:" also work
    tagline: Could whistle any song after hearing it once   # shown on hover
    bio: |
      Paragraphs written in **Markdown**. Blank lines separate paragraphs.

      Links, *italics*, lists and > quotes all work.
    facts:
      - Won the county spelling bee three years running.
      - Never learned to drive, and never wanted to.
    stories:
      - title: The night the barn burned
        told_by: Amy Conroy
        date: 2026-09
        text: |
          The story, as long as it needs to be. Markdown works here too.
```

Notes:

- **Relationships are only written once.** List `parents` on the child and `spouses` on one of the
  partners; children, siblings and the reverse spouse link are worked out automatically.
- **Unknown dates** are fine, just leave the field out. Use `deceased: true` for someone who has
  died when you don't know the date, so the tree shows them correctly.
- **Order matters a little.** The first generation appears left-to-right in file order, so put the
  family you want on the left first. Children are ordered by birth date, then file order.
- **`short_name`** overrides what's printed on the tree (the default is first name + last name, or
  nickname + last name).
- **`gender: f` / `gender: m`** is optional and only tints the placeholder circle for people without a photo.
- Comments start with `#` and are ignored, handy for `# TODO ask Aunt Amy`.

### Photos

Put a photo in `photos/` and reference the filename with `photo:`. Square-ish JPEGs around
400×400 pixels look best and keep the site fast; the site crops them into circles automatically.
People without a photo get a tasteful circle with their initials.

### Linking to a person

Every person has an address: `https://…/family-tree/#lois-laurence`. Share it and the site opens
straight to their page (after the password).

## Changing the password

The site stores only a hash of the password. To set a new one:

```bash
node scripts/hash-password.mjs "your new password"
```

Paste the printed value into `config.js` as `passwordHash` and commit. Everyone will be asked for the
new password on their next visit. Set `passwordHash: null` to remove the password screen.

> The password is a curtain, not a lock: because this is a public repository served by GitHub Pages,
> anyone determined enough can read the files directly. Keep that in mind when deciding what to
> record about living relatives.

## Working locally

```bash
npm run validate      # check family.yaml and photos
npm run serve         # then open http://localhost:8080
```

Any static server works (`npx serve`, VS Code Live Server, …). The site loads YAML over `fetch`,
so it must be served over http rather than opened as a file.

## How it's built

Plain HTML, CSS and JavaScript modules, no framework and no bundler. `src/layout.js` lays the tree
out by generation, keeping couples side by side and centring parents over their children.
`vendor/` holds the two libraries used, [js-yaml](https://github.com/nodeca/js-yaml) and
[marked](https://github.com/markedjs/marked), copied in so the site keeps working for years without
depending on anything external. Fonts are Fraunces and Inter from Google Fonts.
