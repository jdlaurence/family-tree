// Site settings. Edit freely; the site reloads these on every visit.
export default {
  // Shown on the password screen and browser tab (family.yaml's "title" overrides it in the header).
  siteTitle: "The Laurence–Chasen Family",

  // SHA-256 hash of the password relatives type in. The default password is "family".
  // To change it, run:   node scripts/hash-password.mjs "your new password"
  // and paste the result here. Set to null to remove the password screen entirely.
  passwordHash: "d34a569ab7aaa54dacd715ae64953455d86b768846cd0085ef4e9e7471489b7b",

  // Which person to center on when the page opens. null = fit the whole tree.
  rootPersonId: null,

  // The data file.
  dataFile: "family.yaml",
};
