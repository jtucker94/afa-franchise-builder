/* AFA / GM Franchise Builder — league data v0.1.13
   32 teams, 32 NFL head coaches (2026 list), full NFL free-agent pool. */
(function (root) {
  const TEAMS = [
    // Eastern — Northeast
    { id: "prov", city: "Providence", nick: "Anchors", conference: "Eastern", division: "Northeast", abbr: "PRO", primary: "#0a2a4a", secondary: "#d4a017", logo: "providence-anchors.jpg" },
    { id: "hart", city: "Hartford", nick: "Whalers", conference: "Eastern", division: "Northeast", abbr: "HAR", primary: "#046a38", secondary: "#1c8ad4", logo: "hartford-whalers.jpg" },
    { id: "alb", city: "Albany", nick: "Frontiers", conference: "Eastern", division: "Northeast", abbr: "ALB", primary: "#1b4332", secondary: "#c4a574", logo: "albany-frontiers.jpg" },
    { id: "syr", city: "Syracuse", nick: "Forges", conference: "Eastern", division: "Northeast", abbr: "SYR", primary: "#3d3d42", secondary: "#e07a28", logo: "syracuse-forges.jpg" },
    // Eastern — Atlantic
    { id: "sav", city: "Savannah", nick: "Shrimpers", conference: "Eastern", division: "Atlantic", abbr: "SAV", primary: "#0e6b6b", secondary: "#e07a5f", logo: "savannah-shrimpers.jpg" },
    { id: "chs", city: "Charleston", nick: "Palmettos", conference: "Eastern", division: "Atlantic", abbr: "CHS", primary: "#1c5c3a", secondary: "#f0c14a", logo: "charleston-palmettos.jpg" },
    { id: "wilm", city: "Wilmington", nick: "Tide", conference: "Eastern", division: "Atlantic", abbr: "WIL", primary: "#0b3d5c", secondary: "#7ec8e3", logo: "wilmington-tide.jpg" },
    { id: "ral", city: "Raleigh", nick: "Oaks", conference: "Eastern", division: "Atlantic", abbr: "RAL", primary: "#2d4a22", secondary: "#8b5a2b", logo: "raleigh-oaks.jpg" },
    // Eastern — Southeast
    { id: "ash", city: "Asheville", nick: "Ridgebacks", conference: "Eastern", division: "Southeast", abbr: "ASH", primary: "#4a2c6a", secondary: "#c9a36a", logo: "asheville-ridgebacks.jpg" },
    { id: "knx", city: "Knoxville", nick: "Smokies", conference: "Eastern", division: "Southeast", abbr: "KNX", primary: "#4a5568", secondary: "#9bb4c8", logo: "knoxville-smokies.jpg" },
    { id: "bir", city: "Birmingham", nick: "Ironworks", conference: "Eastern", division: "Southeast", abbr: "BIR", primary: "#6b1d1d", secondary: "#c0c0c0", logo: "birmingham-ironworks.jpg" },
    { id: "mob", city: "Mobile", nick: "Baykeepers", conference: "Eastern", division: "Southeast", abbr: "MOB", primary: "#125e8a", secondary: "#d2b48c", logo: "mobile-baykeepers.jpg" },
    // Eastern — Mid-South
    { id: "lou", city: "Louisville", nick: "Distillers", conference: "Eastern", division: "Mid-South", abbr: "LOU", primary: "#5c3317", secondary: "#d4a017", logo: "louisville-distillers.jpg" },
    { id: "lex", city: "Lexington", nick: "Thoroughbreds", conference: "Eastern", division: "Mid-South", abbr: "LEX", primary: "#14532d", secondary: "#d4af37", logo: "lexington-thoroughbreds.jpg" },
    { id: "gso", city: "Greensboro", nick: "Weavers", conference: "Eastern", division: "Mid-South", abbr: "GSO", primary: "#6b1e3a", secondary: "#f3e5ab", logo: "greensboro-weavers.jpg" },
    { id: "roc", city: "Rochester", nick: "Inventors", conference: "Eastern", division: "Mid-South", abbr: "ROC", primary: "#1a365d", secondary: "#e8b923", logo: "rochester-inventors.jpg" },
    // Western — Pacific Northwest
    { id: "spk", city: "Spokane", nick: "Rapids", conference: "Western", division: "Pacific Northwest", abbr: "SPK", primary: "#0b4f6c", secondary: "#7fdbda", logo: "spokane-rapids.jpg" },
    { id: "eug", city: "Eugene", nick: "Evergreens", conference: "Western", division: "Pacific Northwest", abbr: "EUG", primary: "#0b3d1a", secondary: "#d4a017", logo: "eugene-evergreens.jpg" },
    { id: "boi", city: "Boise", nick: "Spudders", conference: "Western", division: "Pacific Northwest", abbr: "BOI", primary: "#6b4f2a", secondary: "#87ceeb", logo: "boise-spudders.jpg" },
    { id: "anc", city: "Anchorage", nick: "Auroras", conference: "Western", division: "Pacific Northwest", abbr: "ANC", primary: "#1a3a4a", secondary: "#3cffb0", logo: "anchorage-auroras.jpg" },
    // Western — Southwest
    { id: "tuc", city: "Tucson", nick: "Saguaros", conference: "Western", division: "Southwest", abbr: "TUC", primary: "#2d5a27", secondary: "#c45c26", logo: "tucson-saguaros.jpg" },
    { id: "sfe", city: "Santa Fe", nick: "Artisans", conference: "Western", division: "Southwest", abbr: "SFE", primary: "#9b2c2c", secondary: "#2a9d8f", logo: "santa-fe-artisans.jpg" },
    { id: "elp", city: "El Paso", nick: "Vaqueros", conference: "Western", division: "Southwest", abbr: "ELP", primary: "#8b3a1a", secondary: "#e6c9a8", logo: "el-paso-vaqueros.jpg" },
    { id: "ren", city: "Reno", nick: "Prospectors", conference: "Western", division: "Southwest", abbr: "REN", primary: "#3d3d40", secondary: "#d4af37", logo: "reno-prospectors.jpg" },
    // Western — Mountain
    { id: "cos", city: "Colorado Springs", nick: "Ascents", conference: "Western", division: "Mountain", abbr: "COS", primary: "#1b365d", secondary: "#f2f6fa", logo: "colorado-springs-ascents.jpg" },
    { id: "bil", city: "Billings", nick: "Mustangs", conference: "Western", division: "Mountain", abbr: "BIL", primary: "#5c2a12", secondary: "#1a1a1a", logo: "billings-mustangs.jpg" },
    { id: "far", city: "Fargo", nick: "Bison", conference: "Western", division: "Mountain", abbr: "FAR", primary: "#4a3420", secondary: "#d4a017", logo: "fargo-bison.jpg" },
    { id: "sxf", city: "Sioux Falls", nick: "Skyforce", conference: "Western", division: "Mountain", abbr: "SXF", primary: "#1e4d8c", secondary: "#0a1628", logo: "sioux-falls-skyforce.jpg" },
    // Western — Central
    { id: "fre", city: "Fresno", nick: "Harvesters", conference: "Western", division: "Central", abbr: "FRE", primary: "#c4a017", secondary: "#2d5a27", logo: "fresno-harvesters.jpg" },
    { id: "bak", city: "Bakersfield", nick: "Drillers", conference: "Western", division: "Central", abbr: "BAK", primary: "#1a1a1a", secondary: "#e07a28", logo: "bakersfield-drillers.jpg" },
    { id: "oma", city: "Omaha", nick: "Plainsmen", conference: "Western", division: "Central", abbr: "OMA", primary: "#c4a02a", secondary: "#4a7ab5", logo: "omaha-plainsmen.jpg" },
    { id: "dsm", city: "Des Moines", nick: "Growers", conference: "Western", division: "Central", abbr: "DSM", primary: "#2e7d32", secondary: "#f2c14e", logo: "des-moines-growers.jpg" }
  ];

  const DIVISIONS = {
    Eastern: ["Northeast", "Atlantic", "Southeast", "Mid-South"],
    Western: ["Pacific Northwest", "Southwest", "Mountain", "Central"]
  };

  /* 2026 NFL head coaches — free agents after the league folded. */
  const COACHES = [
    { id: "reid", name: "Andy Reid", ovr: 97, style: "West Coast / schematic", prev: "Kansas City Chiefs" },
    { id: "shanahan", name: "Kyle Shanahan", ovr: 93, style: "Outside zone", prev: "San Francisco 49ers" },
    { id: "mcvay", name: "Sean McVay", ovr: 93, style: "Motion offense", prev: "Los Angeles Rams" },
    { id: "jharbaugh", name: "John Harbaugh", ovr: 91, style: "Situational / physical", prev: "New York Giants" },
    { id: "mccarthy", name: "Mike McCarthy", ovr: 90, style: "Pro-style / culture", prev: "Pittsburgh Steelers" },
    { id: "payton", name: "Sean Payton", ovr: 90, style: "Aggressive play-caller", prev: "Denver Broncos" },
    { id: "campbell", name: "Dan Campbell", ovr: 90, style: "Physical / complementary", prev: "Detroit Lions" },
    { id: "vrabel", name: "Mike Vrabel", ovr: 89, style: "Defensive identity", prev: "New England Patriots" },
    { id: "lafleur", name: "Matt LaFleur", ovr: 89, style: "Shanahan tree", prev: "Green Bay Packers" },
    { id: "jimharbaugh", name: "Jim Harbaugh", ovr: 88, style: "Run-heavy / tough", prev: "Los Angeles Chargers" },
    { id: "macdonald", name: "Mike Macdonald", ovr: 88, style: "Sim-pressure defense", prev: "Seattle Seahawks" },
    { id: "ryans", name: "DeMeco Ryans", ovr: 87, style: "Wide-9 pressure", prev: "Houston Texans" },
    { id: "oconnell", name: "Kevin O'Connell", ovr: 87, style: "QB development", prev: "Minnesota Vikings" },
    { id: "bjohnson", name: "Ben Johnson", ovr: 86, style: "Creative passing", prev: "Chicago Bears" },
    { id: "sirianni", name: "Nick Sirianni", ovr: 86, style: "Aggressive offense", prev: "Philadelphia Eagles" },
    { id: "quinn", name: "Dan Quinn", ovr: 85, style: "Wide-9 / culture", prev: "Washington Commanders" },
    { id: "coen", name: "Liam Coen", ovr: 84, style: "McVay-tree offense", prev: "Jacksonville Jaguars" },
    { id: "stefanski", name: "Kevin Stefanski", ovr: 83, style: "Play-action / 12 psn", prev: "Atlanta Falcons" },
    { id: "bowles", name: "Todd Bowles", ovr: 83, style: "Exotic blitzes", prev: "Tampa Bay Buccaneers" },
    { id: "taylor", name: "Zac Taylor", ovr: 82, style: "Play-action dropback", prev: "Cincinnati Bengals" },
    { id: "steichen", name: "Shane Steichen", ovr: 81, style: "QB-centric scheme", prev: "Indianapolis Colts" },
    { id: "saleh", name: "Robert Saleh", ovr: 80, style: "Wide-9 / physical D", prev: "Tennessee Titans" },
    { id: "canales", name: "Dave Canales", ovr: 79, style: "QB whisperer", prev: "Carolina Panthers" },
    { id: "schotty", name: "Brian Schottenheimer", ovr: 78, style: "Pro-style balance", prev: "Dallas Cowboys" },
    { id: "glenn", name: "Aaron Glenn", ovr: 78, style: "Man coverage / swagger", prev: "New York Jets" },
    { id: "kmoore", name: "Kellen Moore", ovr: 77, style: "Tempo passing", prev: "New Orleans Saints" },
    { id: "brady", name: "Joe Brady", ovr: 76, style: "Explosive offense", prev: "Buffalo Bills" },
    { id: "minter", name: "Jesse Minter", ovr: 76, style: "Aggressive defense", prev: "Baltimore Ravens" },
    { id: "kubiak", name: "Klint Kubiak", ovr: 75, style: "West Coast / QB-friendly", prev: "Las Vegas Raiders" },
    { id: "hafley", name: "Jeff Hafley", ovr: 75, style: "Defensive structure", prev: "Miami Dolphins" },
    { id: "monken", name: "Todd Monken", ovr: 74, style: "Spread / tempo", prev: "Cleveland Browns" },
    { id: "miklafleur", name: "Mike LaFleur", ovr: 74, style: "Shanahan / McVay tree", prev: "Arizona Cardinals" }
  ];

  // Real NFL roster players — every club folded, all are AFA free agents for the founding draft.
  // Loaded from js/players-nfl.js (window.AFA_NFL_PLAYERS). No generated/fake names.
  const PLAYERS = (root.AFA_NFL_PLAYERS && root.AFA_NFL_PLAYERS.length)
    ? root.AFA_NFL_PLAYERS.slice()
    : [];
  if (!PLAYERS.length) {
    console.error("AFA: players-nfl.js failed to load — draft board will be empty.");
  }


  const POSITIONS = ["QB","RB","WR","TE","OT","OG","C","DE","DT","LB","CB","S","K","P"];

  const POS_GROUPS = {
    Offense: ["QB", "RB", "WR", "TE", "OT", "OG", "C"],
    Defense: ["DE", "DT", "LB", "CB", "S"],
    Special: ["K", "P"]
  };

  const POS_NEED = ["QB", "WR", "DE", "OT", "CB", "RB", "TE", "DT", "LB", "S", "OG", "C", "K", "P"];

  const ROUNDS = 53;
  const TEAMS_N = 32;
  const TOTAL_PICKS = ROUNDS * TEAMS_N;

  const PLAYER_BY_ID = Object.create(null);
  PLAYERS.forEach((pl) => { PLAYER_BY_ID[pl.id] = pl; });

  function teamById(id) { return TEAMS.find((t) => t.id === id); }
  function coachById(id) { return COACHES.find((c) => c.id === id); }
  function playerById(id) { return PLAYER_BY_ID[id]; }
  // Runtime registration (college prospects) — resolvable by id but NOT added to the founding pool
  function registerPlayers(list) {
    (list || []).forEach((pl) => { if (pl && pl.id && !PLAYER_BY_ID[pl.id]) PLAYER_BY_ID[pl.id] = pl; });
  }
  function displayName(team) { return team.city + " " + team.nick; }
  function teamsInDivision(conference, division) {
    return TEAMS.filter((t) => t.conference === conference && t.division === division);
  }

  root.AFA = {
    version: "0.1.14",
    title: "GM Franchise Builder",
    league: "Alliance Football Association",
    leagueAbbr: "AFA",
    TEAMS,
    COACHES,
    PLAYERS,
    DIVISIONS,
    POSITIONS,
    POS_GROUPS,
    POS_NEED,
    ROUNDS,
    TEAMS_N,
    TOTAL_PICKS,
    teamById,
    coachById,
    playerById,
    registerPlayers,
    displayName,
    teamsInDivision
  };
})(window);
