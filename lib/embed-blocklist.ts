// Ad/tracker host + URL denylist and the trusted player-script hosts, shared by the
// embed proxy route and the injected browser shim.
export const BLOCKED_HOST =
  /(^|\.)((adcash|popads|popcash|propellerads|adsterra|exoclick|dtscout|adspyglass|hilltopads|yllix|juicyads)\.com|acscdn\.com|enteringlacquergiant\.com|drawerexperienceletting\.com|adexchangerapid\.com|usrpubtrk\.com|ntwkbc\d+\.com|ndcertainlywhen\.com|usasenioraid\.com|multiboardthe\.com|filenebuladrive\.com|wps\.com|wpscdn\.com|llvpn\.com|thewildernessclub\.com|therocketlanguages\.com|optimserve\.agency|cdn-lab\.shop|tiktokcdn\.com|tracking-source\.com|tonicgoverness\.com|googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|stats\.embedhd\.org|static\.cloudflareinsights\.com|sstatic\d*\.histats\.com|histats\.com)$/i;
export const BLOCKED_URL =
  /((^|\/)ads?\.html(?:$|[?#])|popunder|popads|popcash|propeller|adsterra|exoclick|adcash|adspyglass|dtscout|adexchange|drawerexperienceletting|usrpubtrk|ntwkbc|ndcertainlywhen|senioraid|multiboard|filenebula|wpscdn|wps\.com|wildernessclub|therocketlanguages|optimserve|swarmcloud|cdn-lab|tiktokcdn|tracking-source|cloudflareinsights|histats|googletagmanager|google-analytics|disable-devtool)/i;
export const PLAYER_SCRIPT_HOSTS = new Set(["cdn.jsdelivr.net", "vjs.zencdn.net", "cdnjs.cloudflare.com"]);
