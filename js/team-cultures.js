/* Fictional AFA league and club cultures. Not facts about real people or NFL teams.
 * Simulated traits on real players are labeled simulated and are not biographies.
 */
(function (root) {
  "use strict";

  var LEAGUE = {
    name: "Alliance Football Association",
    founding: "Thirty-two cities chartered the AFA when they were left without a club. The first act of the league is the founding snake draft.",
    tone: "Civic and scrappy. The club belongs to the city more than to a broadcast brand.",
    trophy: "Charter Cup",
    rivalryWeek: "Anchor Week",
    rivalryWeekNote: "The last division weekend. Natural rivals meet, and the harbor bell, ridge drum, or main-street horn marks the kick.",
    traditions: ["Founders' Night, the anniversary of the first draft", "A bell at the draft podium", "The Charter Cup walked through the host city's main street"]
  };

  var CLUBS = {
    prov: { archetype: "Blue-collar grit", owner: "Patient", fans: "They want a hard team that stays, and they will wait through a rebuild if the line is respected.", patience: "Long", philosophy: "Draft and develop", offense: "Outside zone", defense: "4-3", vibe: "Quiet, early, and physical", ritual: "A harbor bell before kickoff", rivals: ["hart"], market: "Mid", appeal: "Steady", tagline: "Hold the line." },
    hart: { archetype: "Tradition first", owner: "Meddling", fans: "They remember every winter and expect the club to honor the old pond.", patience: "Short", philosophy: "Trade aggressively", offense: "Play action", defense: "3-4", vibe: "Loud, loyal, and opinionated", ritual: "A whale-call horn at the first snap", rivals: ["prov", "alb"], market: "Mid", appeal: "Proud", tagline: "The pond remembers." },
    alb: { archetype: "Frontier self-reliance", owner: "Patient", fans: "Small crowds, long memories. They want homegrown players.", patience: "Long", philosophy: "Draft and develop", offense: "Wide zone", defense: "Cover 3", vibe: "Spare and serious", ritual: "Captains walk the trailhead tunnel", rivals: ["syr"], market: "Small", appeal: "Quiet", tagline: "First over the ridge." },
    syr: { archetype: "Mill-town heat", owner: "Win-now", fans: "They want contact and a winter team that hits first.", patience: "Short", philosophy: "Trade aggressively", offense: "Power run", defense: "4-3", vibe: "Hot, blunt, and close", ritual: "A hammer strike on the anvil before introductions", rivals: ["alb"], market: "Small", appeal: "Gritty", tagline: "Heat and hammer." },
    sav: { archetype: "River tempo", owner: "Patient", fans: "They want style with manners. A slow start is fine if the city looks like itself.", patience: "Long", philosophy: "Buy free agents", offense: "Spread", defense: "Nickel", vibe: "Warm and social", ritual: "A shrimp-boat parade on opening weekend", rivals: ["chs"], market: "Small", appeal: "Charming", tagline: "The river sets the tempo." },
    chs: { archetype: "Civic standard", owner: "Patient", fans: "They expect polish and a club that represents the peninsula.", patience: "Medium", philosophy: "Draft and develop", offense: "Pro style", defense: "Cover 2", vibe: "Formal until the fourth quarter", ritual: "A palmetto procession onto the field", rivals: ["sav"], market: "Mid", appeal: "Polished", tagline: "Lowcountry, high standard." },
    wilm: { archetype: "Defense first", owner: "Frugal", fans: "They trust a bend-don't-break team more than a highlight.", patience: "Long", philosophy: "Draft and develop", offense: "West coast", defense: "4-3", vibe: "Low voice, long drives", ritual: "The tide clock is read aloud in the locker room", rivals: ["ral"], market: "Small", appeal: "Understated", tagline: "Wait for the water." },
    ral: { archetype: "Analytics driven", owner: "Patient", fans: "They will debate the chart. They want the process explained.", patience: "Medium", philosophy: "Draft and develop", offense: "Air raid", defense: "Quarters", vibe: "Curious and exact", ritual: "A research huddle posted on the concourse", rivals: ["wilm"], market: "Mid", appeal: "Brainy", tagline: "Measure twice, throw once." },
    ash: { archetype: "Player friendly", owner: "Patient", fans: "Artists and hikers want a club that treats people well.", patience: "Long", philosophy: "Draft and develop", offense: "Outside zone", defense: "Cover 3", vibe: "Loose and kind", ritual: "A sunrise ridge walk for rookies", rivals: ["knx"], market: "Small", appeal: "Welcoming", tagline: "Climb, then strike." },
    knx: { archetype: "Defense first", owner: "Win-now", fans: "The mountains make them expect a team that is hard to move.", patience: "Short", philosophy: "Trade aggressively", offense: "Smashmouth", defense: "Man", vibe: "Thick and proud", ritual: "A smoke cannon at midfield", rivals: ["ash"], market: "Mid", appeal: "Tough", tagline: "Hard to see, harder to move." },
    bir: { archetype: "Blue-collar grit", owner: "Win-now", fans: "Mill families want stars who still punch the clock.", patience: "Short", philosophy: "Buy free agents", offense: "Power run", defense: "3-4", vibe: "Shoulder to shoulder", ritual: "A symbolic iron pour on opening night", rivals: ["mob"], market: "Mid", appeal: "Loud", tagline: "Made in the mill." },
    mob: { archetype: "Channel keepers", owner: "Frugal", fans: "They want the bay protected and the payroll sensible.", patience: "Long", philosophy: "Draft and develop", offense: "Play action", defense: "Cover 2", vibe: "Watchful", ritual: "Lanterns along the tunnel", rivals: ["bir"], market: "Small", appeal: "Steady", tagline: "Keep the channel clear." },
    lou: { archetype: "Flashy offense", owner: "Meddling", fans: "They want a show and a toast, and they will say so.", patience: "Short", philosophy: "Buy free agents", offense: "Spread", defense: "Nickel", vibe: "Celebratory", ritual: "A barrel toast after the anthem", rivals: ["lex"], market: "Mid", appeal: "Glamorous", tagline: "Aged, then poured." },
    lex: { archetype: "Bloodline", owner: "Patient", fans: "They judge pedigree and will wait for the right colt.", patience: "Long", philosophy: "Draft and develop", offense: "Outside zone", defense: "4-3", vibe: "Elegant and competitive", ritual: "A paddock walk for the captains", rivals: ["lou"], market: "Mid", appeal: "Prestigious", tagline: "Bloodline and burst." },
    gso: { archetype: "Player friendly", owner: "Frugal", fans: "Textile towns want everyone to have a job in the scheme.", patience: "Medium", philosophy: "Draft and develop", offense: "West coast", defense: "Zone", vibe: "Even-tempered", ritual: "A loom bell at the end of meetings", rivals: ["roc"], market: "Small", appeal: "Fair", tagline: "Every thread holds." },
    roc: { archetype: "Analytics driven", owner: "Meddling", fans: "Inventor city wants the next idea, not last year's catalog.", patience: "Short", philosophy: "Trade aggressively", offense: "Air raid", defense: "Quarters", vibe: "Restless and bright", ritual: "Prototype night for new installs", rivals: ["gso"], market: "Mid", appeal: "Inventive", tagline: "Invent the next play." },
    spk: { archetype: "Flashy offense", owner: "Win-now", fans: "The falls make them want pace. A stalled drive feels like a drought.", patience: "Short", philosophy: "Trade aggressively", offense: "RPO", defense: "Nickel", vibe: "Fast and impatient", ritual: "A rapid bell on third down", rivals: ["eug"], market: "Small", appeal: "Exciting", tagline: "White water on offense." },
    eug: { archetype: "Player friendly", owner: "Patient", fans: "They want the roster grown locally and treated well.", patience: "Long", philosophy: "Draft and develop", offense: "Outside zone", defense: "Cover 3", vibe: "Green and unhurried", ritual: "Rookies stand under the evergreen canopy", rivals: ["spk", "boi"], market: "Mid", appeal: "Welcoming", tagline: "Grow it here." },
    boi: { archetype: "Plain work", owner: "Frugal", fans: "They distrust flash. They want a full day's work.", patience: "Long", philosophy: "Draft and develop", offense: "Power run", defense: "4-3", vibe: "Plainspoken", ritual: "A harvest supper for the practice squad", rivals: ["eug"], market: "Small", appeal: "Honest", tagline: "Plain work, long season." },
    anc: { archetype: "Defense first", owner: "Patient", fans: "Long nights. They will wait if the defense travels.", patience: "Long", philosophy: "Draft and develop", offense: "Play action", defense: "Cover 3", vibe: "Isolated and fierce", ritual: "Lights-out for the defensive anthem", rivals: ["spk"], market: "Small", appeal: "Remote", tagline: "Dark sky, bright hit." },
    tuc: { archetype: "Desert stand", owner: "Patient", fans: "Heat is a point of pride. They want a team that does not wilt.", patience: "Long", philosophy: "Draft and develop", offense: "Wide zone", defense: "Cover 2", vibe: "Spare and enduring", ritual: "A saguaro sunrise meeting", rivals: ["sfe"], market: "Small", appeal: "Hardy", tagline: "Stand in the heat." },
    sfe: { archetype: "Handmade", owner: "Meddling", fans: "They want craft, color, and a say in the roster.", patience: "Short", philosophy: "Buy free agents", offense: "Spread", defense: "Nickel", vibe: "Artistic and particular", ritual: "An artisan market on the plaza", rivals: ["tuc", "elp"], market: "Small", appeal: "Distinctive", tagline: "Make it by hand." },
    elp: { archetype: "Gap riders", owner: "Win-now", fans: "Two countries of family. They want the run game to honor the ride.", patience: "Short", philosophy: "Trade aggressively", offense: "Outside zone", defense: "Man", vibe: "Proud and direct", ritual: "A vaquero entrance from the tunnel", rivals: ["sfe"], market: "Mid", appeal: "Proud", tagline: "Ride the gap." },
    ren: { archetype: "High variance", owner: "Win-now", fans: "They will live with a miss if the throw was bold.", patience: "Short", philosophy: "Buy free agents", offense: "Air raid", defense: "Nickel", vibe: "Restless", ritual: "A claim-stake planted at midfield", rivals: ["elp"], market: "Small", appeal: "Risky", tagline: "Stake it and throw." },
    cos: { archetype: "Analytics driven", owner: "Patient", fans: "A planning town. They want the ascent mapped.", patience: "Medium", philosophy: "Draft and develop", offense: "Pro style", defense: "Quarters", vibe: "Disciplined", ritual: "A summit briefing the Friday before", rivals: ["bil"], market: "Mid", appeal: "Orderly", tagline: "Plan the ascent." },
    bil: { archetype: "Range rules", owner: "Frugal", fans: "Ranch country wants few words and fewer luxury contracts.", patience: "Long", philosophy: "Draft and develop", offense: "Power run", defense: "3-4", vibe: "Dry and tough", ritual: "A mustang turnout for the offensive line", rivals: ["far"], market: "Small", appeal: "Rugged", tagline: "Range rules." },
    far: { archetype: "Defense first", owner: "Patient", fans: "Wind and winter. They want a defense that leans into it.", patience: "Long", philosophy: "Draft and develop", offense: "West coast", defense: "Cover 2", vibe: "Stoic", ritual: "A bison drum in the tunnel", rivals: ["bil", "sxf"], market: "Small", appeal: "Stoic", tagline: "Shoulder the wind." },
    sxf: { archetype: "See it early", owner: "Win-now", fans: "They want the jump on the rest of the plains.", patience: "Short", philosophy: "Trade aggressively", offense: "RPO", defense: "Quarters", vibe: "Alert", ritual: "A skyline watch on the roof", rivals: ["far"], market: "Small", appeal: "Sharp", tagline: "See it early." },
    fre: { archetype: "Player friendly", owner: "Frugal", fans: "Valley crews want the roster fed and the checks to clear.", patience: "Medium", philosophy: "Draft and develop", offense: "Outside zone", defense: "Zone", vibe: "Communal", ritual: "A harvest bell after wins", rivals: ["bak"], market: "Mid", appeal: "Warm", tagline: "Bring it in." },
    bak: { archetype: "Punch through", owner: "Win-now", fans: "Oil town. They want the pile moved now.", patience: "Short", philosophy: "Buy free agents", offense: "Power run", defense: "Man", vibe: "Loud and short-fused", ritual: "A derrick horn at kickoff", rivals: ["fre"], market: "Small", appeal: "Intense", tagline: "Punch through." },
    oma: { archetype: "Middle of the map", owner: "Patient", fans: "They want a club the plains can meet in.", patience: "Medium", philosophy: "Draft and develop", offense: "Play action", defense: "4-3", vibe: "Neighborly and firm", ritual: "A stockyard breakfast for the roster", rivals: ["dsm"], market: "Mid", appeal: "Central", tagline: "Meet at the middle." },
    dsm: { archetype: "Seed and harvest", owner: "Frugal", fans: "They will fund the plan if the plan is visible.", patience: "Long", philosophy: "Draft and develop", offense: "West coast", defense: "Cover 3", vibe: "Practical", ritual: "A growers' market on the concourse", rivals: ["oma"], market: "Small", appeal: "Practical", tagline: "Seed, then harvest." }
  };

  var TRAITS = ["leader", "film junkie", "diva", "mentor", "loner"];

  function simulatedTrait(id) {
    var s = String(id || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 997;
    return TRAITS[h % TRAITS.length];
  }

  function culture(id) { return CLUBS[id] || null; }

  function cultureFit(trait, club) {
    trait = String(trait || "");
    if (!club) return { fit: "unknown", delta: 0, simulated: true };
    var clash = (trait === "diva" && (club.owner === "Frugal" || club.archetype === "Defense first"))
      || (trait === "loner" && club.archetype === "Player friendly");
    var mesh = (trait === "leader" && (club.archetype === "Blue-collar grit" || club.archetype === "Player friendly"))
      || (trait === "film junkie" && club.archetype === "Analytics driven")
      || (trait === "mentor" && club.philosophy === "Draft and develop");
    if (clash) return { fit: "clash", delta: -1, simulated: true, note: "Simulated trait clashes with this club's culture." };
    if (mesh) return { fit: "fit", delta: 1, simulated: true, note: "Simulated trait fits this club's culture." };
    return { fit: "neutral", delta: 0, simulated: true, note: "Simulated trait. No strong culture fit." };
  }

  function faAppeal(club) {
    if (!club) return 0;
    var market = club.market === "Mid" ? 1 : 0;
    var vibe = club.appeal === "Welcoming" || club.appeal === "Glamorous" || club.appeal === "Exciting" ? 1 : 0;
    return market + vibe;
  }

  function cpuBias(club) {
    if (!club) return { urgency: 0, spend: 0 };
    return {
      urgency: club.philosophy === "Trade aggressively" || club.owner === "Win-now" ? 1 : 0,
      spend: club.owner === "Frugal" ? -1 : (club.philosophy === "Buy free agents" ? 1 : 0)
    };
  }

  function approvalTarget(club) {
    if (!club) return 60;
    if (club.owner === "Win-now" || club.patience === "Short") return 70;
    if (club.owner === "Patient" || club.patience === "Long") return 50;
    return 60;
  }

  function evolve(drift, record, coachChanged) {
    drift = drift || { seasons: 0, patienceShift: 0 };
    var next = { seasons: (drift.seasons || 0) + 1, patienceShift: drift.patienceShift || 0, note: "Culture holds." };
    var wins = record && record.w || 0;
    if (wins >= 11) { next.patienceShift += 1; next.note = "A long winning run is making the building less patient."; }
    else if (wins <= 4) { next.patienceShift -= 1; next.note = "A hard year is pushing the club back toward patience."; }
    if (coachChanged) next.note += " A coaching change loosened the old ritual.";
    next.patienceShift = Math.max(-2, Math.min(2, next.patienceShift));
    next.simulated = true;
    return next;
  }

  root.AFACultures = {
    LEAGUE: LEAGUE,
    CLUBS: CLUBS,
    culture: culture,
    simulatedTrait: simulatedTrait,
    cultureFit: cultureFit,
    faAppeal: faAppeal,
    cpuBias: cpuBias,
    approvalTarget: approvalTarget,
    evolve: evolve
  };
})(typeof window !== "undefined" ? window : globalThis);
