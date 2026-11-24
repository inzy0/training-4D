// Extensions: free external learning resources across medicine and sport, opened in the browser.
// Nothing from these sites is copied into the app. Several do not allow reuse or automated
// retrieval of their content (checked 2026-11-22 at each site's own terms page where reachable:
// DermNet CC BY-NC-ND + no harvesting; HistologyGuide, WebPath, Shirley Ryan AbilityLab: all
// rights reserved, personal use; PathologyOutlines, Radiopaedia, Physiopedia refused the check),
// so they are offered as links only. "Search" uses the site's own public search address where it
// has a standard one, otherwise a DuckDuckGo site: search.
// "Access" says what a reader needs: free = free to read without an account; free tier = some
// content needs a free account or is behind a paid tier.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ddg = (host) => (q) => `https://duckduckgo.com/?q=${encodeURIComponent(`site:${host} ${q}`)}`;
const mw = (base) => (q) => `${base}?search=${encodeURIComponent(q)}`; // MediaWiki search
const wp = (base) => (q) => `${base}/?s=${encodeURIComponent(q)}`; // WordPress search

export const EXT = [
  // [group, name, url, what, access, search(q) | null, licence note]
  ['Textbooks & references', 'StatPearls (NCBI Bookshelf)', 'https://www.ncbi.nlm.nih.gov/books/NBK430685/', 'Peer-reviewed chapters across medicine; already in this app verbatim (Clinical tab).', 'free', (q) => `https://www.ncbi.nlm.nih.gov/books/?term=${encodeURIComponent(q + ' statpearls')}`, 'CC BY-NC-ND 4.0'],
  ['Textbooks & references', 'NCBI Bookshelf', 'https://www.ncbi.nlm.nih.gov/books/', 'Thousands of open textbooks, guidelines and reports.', 'free', (q) => `https://www.ncbi.nlm.nih.gov/books/?term=${encodeURIComponent(q)}`, 'licence per book'],
  ['Textbooks & references', 'MedlinePlus (incl. Lab Tests)', 'https://medlineplus.gov/', 'NLM consumer health: conditions, 150+ lab-test explanations, drugs.', 'free', (q) => `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=${encodeURIComponent(q)}`, 'test pages public domain; some content licensed'],
  ['Textbooks & references', 'MSD Manual Professional', 'https://www.msdmanuals.com/professional', 'Clinical reference for every specialty.', 'free', ddg('msdmanuals.com/professional'), 'terms: see site'],
  ['Textbooks & references', 'OpenStax Anatomy & Physiology 2e', 'https://openstax.org/details/books/anatomy-and-physiology-2e', 'Open textbook (also in this app’s library).', 'free', ddg('openstax.org'), 'terms: see site'],
  ['Textbooks & references', 'LibreTexts Medicine', 'https://med.libretexts.org/', 'Open medical and health-science textbooks.', 'free', ddg('med.libretexts.org'), 'terms: see site'],
  ['Textbooks & references', 'Wikipedia (medicine)', 'https://en.wikipedia.org/wiki/Portal:Medicine', 'General overview with references.', 'free', mw('https://en.wikipedia.org/w/index.php'), 'terms: see site'],
  ['Pathology', 'PathologyOutlines', 'https://www.pathologyoutlines.com/', 'Surgical and clinical pathology by organ, with images.', 'free', ddg('pathologyoutlines.com'), 'terms page not reachable 2026-11-22; links only'],
  ['Pathology', 'Libre Pathology', 'https://librepathology.org/', 'Open pathology wiki.', 'free', mw('https://librepathology.org/w/index.php'), 'terms: see site'],
  ['Pathology', 'WebPath (University of Utah)', 'https://webpath.med.utah.edu/', 'Pathology images and tutorials.', 'free', ddg('webpath.med.utah.edu'), 'all rights reserved; personal use'],
  ['Pathology', 'PathPresenter', 'https://pathpresenter.net/', 'Whole-slide pathology image library.', 'free tier', ddg('pathpresenter.net'), 'terms: see site'],
  ['Radiology & imaging', 'Radiopaedia', 'https://radiopaedia.org/', 'Radiology articles and cases.', 'free', (q) => `https://radiopaedia.org/search?q=${encodeURIComponent(q)}`, 'terms page not reachable 2026-11-22; links only'],
  ['Radiology & imaging', 'The Radiology Assistant', 'https://radiologyassistant.nl/', 'Structured radiology teaching by region.', 'free', ddg('radiologyassistant.nl'), 'terms: see site'],
  ['Radiology & imaging', 'Open-i (NLM)', 'https://openi.nlm.nih.gov/', 'Search of open-access biomedical images.', 'free', (q) => `https://openi.nlm.nih.gov/gridquery?q=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Radiology & imaging', 'MedPix (NLM)', 'https://lhncbc.nlm.nih.gov/medpix.html', 'Medical image database (was temporarily unavailable on 2026-11-22).', 'free', null, 'NLM'],
  ['Radiology & imaging', 'IMAIOS e-Anatomy', 'https://www.imaios.com/en/e-anatomy', 'Labelled cross-sectional anatomy.', 'free tier', ddg('imaios.com'), 'terms: see site'],
  ['Dermatology', 'DermNet', 'https://dermnetnz.org/', 'Skin conditions with images.', 'free', ddg('dermnetnz.org'), 'images CC BY-NC-ND; no harvesting; links only'],
  ['Dermatology', 'DermIS', 'https://www.dermis.net/', 'Dermatology image atlas.', 'free', ddg('dermis.net'), 'terms: see site'],
  ['Histology', 'HistologyGuide', 'https://histologyguide.com/', 'Virtual microscope slides with descriptions.', 'free', ddg('histologyguide.com'), 'all rights reserved; personal use'],
  ['Histology', 'University of Michigan Virtual Slide Box', 'https://histology.medicine.umich.edu/', 'Histology and pathology virtual slides.', 'free', ddg('histology.medicine.umich.edu'), 'terms: see site'],
  ['Histology', 'Blue Histology (UWA)', 'https://www.lab.anhb.uwa.edu.au/mb140/', 'Histology tutorials.', 'free', null, 'terms: see site'],
  ['Anatomy', 'The Folded Mind (neuropsychiatry 3D brain atlas)', 'https://thefoldedmind.com/en/', 'Clinician-made 3D brain on the MNI template: 104 structures, Panksepp systems, 8 neurotransmitter pathways, Yeo networks, 10 psychiatric diagnoses, 13 medications, MRI split view, weekly research newsletter.', 'free', ddg('thefoldedmind.com'), 'texts, images and design © A. M. Çetin: short quotes with attribution and link only; links only here (its open source atlases are used directly)'],
  ['Anatomy', 'Z-Anatomy', 'https://www.z-anatomy.com/', 'Open 3D atlas (its nerves are in this app’s Brain map).', 'free', null, 'CC BY-SA 4.0'],
  ['Anatomy', 'TeachMeAnatomy', 'https://teachmeanatomy.info/', 'Anatomy by region with clinical notes.', 'free', wp('https://teachmeanatomy.info'), 'terms: see site'],
  ['Anatomy', 'Kenhub', 'https://www.kenhub.com/', 'Anatomy articles and quizzes.', 'free tier', ddg('kenhub.com'), 'terms: see site'],
  ['Anatomy', 'AnatomyTOOL', 'https://anatomytool.org/', 'Open anatomy images.', 'free', ddg('anatomytool.org'), 'terms: see site'],
  ['Sports medicine & rehabilitation', 'Physiopedia', 'https://www.physio-pedia.com/', 'Physiotherapy wiki: special tests, outcome measures, conditions.', 'free', mw('https://www.physio-pedia.com/index.php'), 'links only'],
  ['Sports medicine & rehabilitation', 'Rehabilitation Measures Database (Shirley Ryan AbilityLab)', 'https://www.sralab.org/rehabilitation-measures', 'Instrument summaries: psychometrics, norms, cut-offs.', 'free', ddg('sralab.org/rehabilitation-measures'), 'all rights reserved; personal use'],
  ['Sports medicine & rehabilitation', 'British Journal of Sports Medicine (open articles)', 'https://bjsm.bmj.com/', 'Consensus statements (return to sport, concussion, RED-S).', 'free tier', ddg('bjsm.bmj.com'), 'terms: see site'],
  ['Sports medicine & rehabilitation', 'WADA Prohibited List', 'https://www.wada-ama.org/en/prohibited-list', 'Substances and methods prohibited in sport.', 'free', ddg('wada-ama.org'), 'terms: see site'],
  ['Sports medicine & rehabilitation', 'Global DRO', 'https://www.globaldro.com/', 'Check a medication’s status in sport.', 'free', null, 'terms: see site'],
  ['Sports medicine & rehabilitation', 'Concussion in Sport Group (SCAT)', 'https://bjsm.bmj.com/content/57/11/695', 'Consensus statement and SCAT6 tools.', 'free', null, 'terms: see site'],
  ['Research literature', 'PubMed', 'https://pubmed.ncbi.nlm.nih.gov/', 'Biomedical literature index.', 'free', (q) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Research literature', 'Europe PMC', 'https://europepmc.org/', 'Open-access full texts and preprints.', 'free', (q) => `https://europepmc.org/search?query=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Research literature', 'Cochrane Library', 'https://www.cochranelibrary.com/', 'Systematic reviews (abstracts free).', 'free tier', ddg('cochranelibrary.com'), 'terms: see site'],
  ['Research literature', 'ClinicalTrials.gov', 'https://clinicaltrials.gov/', 'Trial registry (also in this project’s library).', 'free', (q) => `https://clinicaltrials.gov/search?term=${encodeURIComponent(q)}`, 'public domain'],
  ['Research literature', 'Semantic Scholar', 'https://www.semanticscholar.org/', 'Literature search with citation graph.', 'free', (q) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Research literature', 'Google Scholar', 'https://scholar.google.com/', 'Broad scholarly search.', 'free', (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Drugs', 'DailyMed (NLM)', 'https://dailymed.nlm.nih.gov/', 'Official drug labels.', 'free', (q) => `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Drugs', 'LiverTox (NCBI)', 'https://www.ncbi.nlm.nih.gov/books/NBK547852/', 'Drug and supplement liver injury (in this project’s substance KB).', 'free', (q) => `https://www.ncbi.nlm.nih.gov/books/NBK547852/?term=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Genetics', 'OMIM', 'https://www.omim.org/', 'Genes and genetic disorders.', 'free', (q) => `https://www.omim.org/search?search=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Genetics', 'GeneCards', 'https://www.genecards.org/', 'Gene summaries.', 'free', (q) => `https://www.genecards.org/Search/Keyword?queryString=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Genetics', 'ClinVar', 'https://www.ncbi.nlm.nih.gov/clinvar/', 'Variant interpretations (in this project’s library).', 'free', (q) => `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Clinical tools & guidelines', 'MDCalc', 'https://www.mdcalc.com/', 'Clinical calculators and scores.', 'free', ddg('mdcalc.com'), 'terms: see site'],
  ['Clinical tools & guidelines', 'NICE guidance', 'https://www.nice.org.uk/guidance', 'UK clinical guidelines.', 'free', (q) => `https://www.nice.org.uk/search?q=${encodeURIComponent(q)}`, 'terms: see site'],
  ['Clinical tools & guidelines', 'WHO IRIS', 'https://iris.who.int/', 'WHO guidelines and reports.', 'free', ddg('iris.who.int'), 'terms: see site'],
  ['Clinical tools & guidelines', 'Life in the Fast Lane (LITFL)', 'https://litfl.com/', 'ECG library, emergency and critical care.', 'free', wp('https://litfl.com'), 'terms: see site'],
  ['Clinical tools & guidelines', 'WikEM', 'https://wikem.org/', 'Emergency medicine wiki.', 'free', mw('https://wikem.org/w/index.php'), 'terms: see site'],
  ['Clinical tools & guidelines', 'EyeWiki (AAO)', 'https://eyewiki.org/', 'Ophthalmology wiki.', 'free', ddg('eyewiki.org'), 'terms: see site'],
  ['Learning & exams', 'Geeky Medics', 'https://geekymedics.com/', 'OSCE guides, examinations, procedures.', 'free tier', wp('https://geekymedics.com'), 'terms: see site'],
  ['Learning & exams', 'Khan Academy: Health and medicine', 'https://www.khanacademy.org/science/health-and-medicine', 'Video lessons in physiology and disease.', 'free', ddg('khanacademy.org'), 'terms: see site'],
  ['Learning & exams', 'MIT OpenCourseWare (health sciences)', 'https://ocw.mit.edu/search/?d=Health%20Sciences%20and%20Technology', 'University course materials.', 'free', ddg('ocw.mit.edu'), 'terms: see site'],
  // added 2026-11-24 (links only; each address checked to respond, or a well-known official site that refuses automated checks)
  ['S&C bodies & coaching standards', 'UKSCA (UK Strength and Conditioning Association)', 'https://www.uksca.org.uk/', 'UK professional body: accreditation pathway, coaching standards, events, articles.', 'free tier', ddg('uksca.org.uk'), 'terms: see site'],
  ['S&C bodies & coaching standards', 'NSCA (National Strength and Conditioning Association, US)', 'https://www.nsca.com/', 'US professional body: CSCS / NSCA-CPT certifications, Essentials of S&C, position statements.', 'free tier', ddg('nsca.com'), 'terms: see site (site refuses automated checks)'],
  ['S&C bodies & coaching standards', 'ASCA (Australian Strength and Conditioning Association)', 'https://www.strengthandconditioning.org/', 'Australian professional body and coaching accreditation levels.', 'free tier', ddg('strengthandconditioning.org'), 'terms: see site'],
  ['S&C bodies & coaching standards', 'BASES (British Association of Sport and Exercise Sciences)', 'https://www.bases.org.uk/', 'UK sport and exercise science accreditation, expert statements.', 'free tier', ddg('bases.org.uk'), 'terms: see site'],
  ['S&C bodies & coaching standards', 'ACSM (American College of Sports Medicine)', 'https://www.acsm.org/', 'US exercise science: guidelines, position stands, certifications.', 'free tier', ddg('acsm.org'), 'terms: see site (site refuses automated checks)'],
  ['S&C bodies & coaching standards', 'UK Coaching', 'https://www.ukcoaching.org/', 'Coaching resources and courses (UK).', 'free tier', ddg('ukcoaching.org'), 'terms: see site'],
  ['S&C bodies & coaching standards', 'Team USA (USOPC coaching)', 'https://www.teamusa.org/', 'US Olympic & Paralympic coaching education and athlete development.', 'free', ddg('teamusa.org'), 'terms: see site'],
  ['Sprint, jumps & athletics', 'World Athletics', 'https://worldathletics.org/', 'Rules, coaching education and event technical guides for sprints, jumps and throws.', 'free', ddg('worldathletics.org'), 'terms: see site'],
  ['Sprint, jumps & athletics', 'UK Athletics (UKA)', 'https://www.uka.org.uk/', 'UK athletics coaching qualifications and resources.', 'free', ddg('uka.org.uk'), 'terms: see site'],
  ['Sprint, jumps & athletics', 'SimpliFaster', 'https://simplifaster.com/', 'Speed, power and sprint-coaching articles.', 'free', wp('https://simplifaster.com'), 'terms: see site'],
  ['Biomechanics', 'ISBS (International Society of Biomechanics in Sports)', 'https://isbs.org/', 'Sports biomechanics society; open conference proceedings archive.', 'free', ddg('isbs.org'), 'terms: see site'],
  ['Biomechanics', 'ISB (International Society of Biomechanics)', 'https://isbweb.org/', 'Biomechanics society: standards (joint coordinate systems), software and data links.', 'free', ddg('isbweb.org'), 'terms: see site'],
  ['Biomechanics', 'OpenSim (Stanford)', 'https://opensim.stanford.edu/', 'Free musculoskeletal modelling and simulation software.', 'free', ddg('opensim.stanford.edu'), 'Apache-2.0 software; models per licence'],
  ['Biomechanics', 'Kinovea', 'https://www.kinovea.org/', 'Free video analysis: angles, distances, timing for sport movement.', 'free', null, 'GPL-2.0 software'],
  ['Biomechanics', 'Tracker (Open Source Physics)', 'https://physlets.org/tracker/', 'Free video motion tracking and modelling.', 'free', null, 'GPL software'],
  ['Biomechanics', 'Sports Biomechanics (journal)', 'https://www.tandfonline.com/journals/rspb20', 'ISBS journal (Taylor & Francis).', 'paid (some free)', ddg('tandfonline.com/journals/rspb20'), 'publisher terms (site refuses automated checks)'],
  ['Biomechanics', 'Journal of Strength and Conditioning Research', 'https://journals.lww.com/nsca-jscr/', 'NSCA research journal.', 'paid (some free)', ddg('journals.lww.com/nsca-jscr'), 'publisher terms (site refuses automated checks)'],
  ['Training libraries & tools', 'ExRx.net', 'https://exrx.net/', 'Exercise and muscle directory, kinesiology, fitness tests.', 'free', ddg('exrx.net'), 'terms: see site'],
  ['Training libraries & tools', 'Science for Sport', 'https://www.scienceforsport.com/', 'Plain-language sport-science articles (speed, power, testing).', 'free tier', ddg('scienceforsport.com'), 'terms: see site'],
  ['Training libraries & tools', 'Sportsmith', 'https://www.sportsmith.co/', 'S&C and sports-science education from practitioners.', 'paid (free tier)', ddg('sportsmith.co'), 'terms: see site'],
  ['Training libraries & tools', 'TrainingPeaks', 'https://www.trainingpeaks.com/', 'Endurance and hybrid training planning and load tracking.', 'paid (free tier)', null, 'terms: see site'],
  ['Training libraries & tools', 'Strength Level', 'https://www.strengthlevel.com/', 'Strength standards by lift, body weight and sex (user-submitted).', 'free', null, 'terms: see site'],
  ['Training libraries & tools', 'OpenPowerlifting', 'https://www.openpowerlifting.org/', 'Open archive of powerlifting meet results.', 'free', null, 'public-domain data'],
  ['S&C bodies & coaching standards', 'IWF (International Weightlifting Federation)', 'https://iwf.sport/', 'Weightlifting rules (TCRR) and technical standards; used for the Motion Lab barbell specs.', 'free', null, 'terms: see site (site refuses automated checks)'],
];

// Added 2026-11-24. Every URL answered an automated check that day (generic client name, no browser spoofing); descriptions
// follow each site's own title and description. Sites that refused or did not answer were left out.
const G_SUP = 'Supplement testing & anti-doping (Informed Sport and similar)';
const G_EXT = 'Extreme & adventure sports training';
const G_UNI = 'Unique: international learning';
EXT.push(
  [G_SUP, 'INFORMED (LGC) programmes', 'https://www.wetestyoutrust.com/', 'Hub of the INFORMED certification programmes: independent testing of supplements, ingredients and manufacturing sites for banned and unsafe substances.', 'free to search', ddg('wetestyoutrust.com'), 'terms: see site'],
  [G_SUP, 'Informed Sport', 'https://sport.wetestyoutrust.com/', 'Sports-supplement certification: every batch of a certified product is tested for banned substances; search certified products.', 'free to search', ddg('sport.wetestyoutrust.com'), 'terms: see site', 'branch of INFORMED'],
  [G_SUP, 'Informed Choice', 'https://choice.wetestyoutrust.com/', 'Retail monitoring and quality-assurance testing for dietary supplements.', 'free to search', null, 'terms: see site', 'branch of INFORMED'],
  [G_SUP, 'Informed Protein', 'https://protein.wetestyoutrust.com/', 'Independent verification of protein product claims.', 'free to search', null, 'terms: see site', 'branch of INFORMED'],
  [G_SUP, 'Informed Ingredient', 'https://ingredient.wetestyoutrust.com/', 'Testing that nutrition-product ingredients are made to quality standards.', 'free to search', null, 'terms: see site', 'branch of INFORMED'],
  [G_SUP, 'NSF Certified for Sport', 'https://www.nsfsport.com/', 'Certification of sports supplements for banned substances (used by many US leagues).', 'free to search', ddg('nsfsport.com'), 'terms: see site'],
  [G_SUP, 'BSCG', 'https://www.bscg.org/', 'Dietary-supplement certification, testing and compliance.', 'free to search', ddg('bscg.org'), 'terms: see site'],
  [G_SUP, 'Cologne List (Kölner Liste)', 'https://www.koelnerliste.com/en/', 'Supplements tested for doping substances; the list states it is not a recommendation to use any supplement.', 'free', ddg('koelnerliste.com'), 'terms: see site'],
  [G_SUP, 'USADA Supplement Connect', 'https://www.usada.org/substances/supplement-connect/', 'US Anti-Doping Agency guidance on supplement risk and third-party certification.', 'free', ddg('usada.org'), 'terms: see site'],
  [G_SUP, 'TrueSport (USADA)', 'https://truesport.org/', 'Free sport-education programmes and materials for coaches, parents and athletes.', 'free', ddg('truesport.org'), 'terms: see site'],
  [G_SUP, 'UK Anti-Doping (UKAD)', 'https://www.ukad.org.uk/', 'Clean-sport rules, medicine checks and resources for athletes, practitioners, coaches and parents.', 'free', ddg('ukad.org.uk'), 'terms: see site'],
  [G_SUP, 'Operation Supplement Safety (US DoD)', 'https://www.opss.org/', 'Department of Defense dietary-supplement resource for the military community and health-care providers.', 'free', ddg('opss.org'), 'US government site'],
  [G_SUP, 'AIS Sports Supplement Framework', 'https://www.ausport.gov.au/ais/nutrition/supplements', 'Australian Institute of Sport supplement classification and fact sheets.', 'free', ddg('ausport.gov.au'), 'terms: see site'],

  [G_EXT, 'Lattice Training', 'https://latticetraining.com/', 'Climbing training plans and assessments built on measured data.', 'free articles + paid', ddg('latticetraining.com'), 'terms: see site'],
  [G_EXT, 'TrainingBeta', 'https://www.trainingbeta.com/', 'Rock-climbing training blog, podcast and programmes.', 'free articles + paid', wp('https://www.trainingbeta.com'), 'terms: see site'],
  [G_EXT, 'Training for Climbing (Eric Hörst)', 'https://trainingforclimbing.com/', 'Climbing-specific strength, finger training and technique.', 'free articles + paid', ddg('trainingforclimbing.com'), 'terms: see site'],
  [G_EXT, 'The Climbing Doctor', 'https://theclimbingdoctor.com/', 'Climbing injury prevention and rehabilitation (fingers, shoulders, elbows).', 'free articles + paid', ddg('theclimbingdoctor.com'), 'terms: see site'],
  [G_EXT, 'Surf Strength Coach', 'https://surfstrengthcoach.com/', 'Strength, mobility and conditioning programmes for surfing.', 'free articles + paid', ddg('surfstrengthcoach.com'), 'terms: see site'],
  [G_EXT, 'Mountain Tactical Institute', 'https://mtntactical.com/', 'Mission-direct programming for mountain and tactical athletes (ski, climb, rescue, military).', 'free articles + paid', ddg('mtntactical.com'), 'terms: see site'],
  [G_EXT, 'World Climbing (IFSC)', 'https://www.worldclimbing.com/', 'Sport-climbing federation: rules, formats and competition standards.', 'free', ddg('worldclimbing.com'), 'terms: see site'],
  [G_EXT, 'FIS (ski and snowboard)', 'https://www.fis-ski.com/', 'International Ski and Snowboard Federation: alpine, freestyle, snowboard, ski jumping rules.', 'free', ddg('fis-ski.com'), 'terms: see site'],
  [G_EXT, 'International Surfing Association', 'https://isasurf.org/', 'Surfing’s world governing body; coaching and judging courses.', 'free', ddg('isasurf.org'), 'terms: see site'],
  [G_EXT, 'British Mountaineering Council', 'https://www.thebmc.co.uk/en', 'Climbing, hill-walking and mountaineering skills, safety and training advice.', 'free', ddg('thebmc.co.uk'), 'terms: see site'],
  [G_EXT, 'Mountain Training (UK)', 'https://www.mountain-training.org/', 'Walking, climbing and mountaineering leader qualifications and skills.', 'free', ddg('mountain-training.org'), 'terms: see site'],
  [G_EXT, 'IFMGA (mountain guides)', 'https://ifmga.net/', 'International standard for mountain-guide training.', 'free', null, 'terms: see site'],
  [G_EXT, 'UIAA Medical Commission papers', 'https://www.theuiaa.org/mountain-medicine/medical-advice/', 'Mountain-medicine recommendations (altitude, expeditions, women and children, drugs), translated into several languages.', 'free', ddg('theuiaa.org'), 'terms: see site'],
  [G_EXT, 'Wilderness Medical Society', 'https://wms.org/', 'Wilderness-medicine education, practice guidelines and certification.', 'free articles + paid', ddg('wms.org'), 'terms: see site'],
  [G_EXT, 'Altitude.org', 'https://www.altitude.org/', 'High-altitude physiology and illness explained.', 'free', ddg('altitude.org'), 'terms: see site'],
  [G_EXT, 'USPA (skydiving)', 'https://www.uspa.org/', 'Skydiving training progression, ratings and safety.', 'free', ddg('uspa.org'), 'terms: see site'],
  [G_EXT, 'Parkour Earth', 'https://www.parkour.earth/', 'International parkour federation: coaching and safety.', 'free', null, 'terms: see site'],

  [G_UNI, 'Aspetar Sports Medicine Journal', 'https://journal.aspetar.com/en/home', 'Free sports-medicine journal from Qatar’s orthopaedic and sports-medicine hospital; practical, clinician-written.', 'free', ddg('journal.aspetar.com'), 'terms: see site', 'Unique'],
  [G_UNI, 'PEDro', 'https://pedro.org.au/', 'Every trial, review and guideline on physiotherapy interventions, rated for quality; in many languages.', 'free', ddg('pedro.org.au'), 'terms: see site', 'Unique'],
  [G_UNI, 'PhysiotherapyExercises.com', 'https://www.physiotherapyexercises.com/', 'Free exercise-prescription library with illustrated handouts, built for low-resource settings and translated widely.', 'free', ddg('physiotherapyexercises.com'), 'terms: see site', 'Unique'],
  [G_UNI, 'Sportscience (sportsci.org)', 'https://www.sportsci.org/', 'Will Hopkins’ resources on research design and statistics for sport and exercise.', 'free', ddg('sportsci.org'), 'terms: see site', 'Unique'],
  [G_UNI, 'Instant Anatomy', 'https://www.instantanatomy.net/', 'Free anatomy diagrams, lectures, podcasts and MCQs by region.', 'free', ddg('instantanatomy.net'), 'terms: see site', 'Unique'],
  [G_UNI, 'TeachMePhysiology', 'https://teachmephysiology.com/', 'Concise illustrated physiology for students.', 'free', ddg('teachmephysiology.com'), 'terms: see site', 'Unique'],
  [G_UNI, 'OrthopaedicsOne', 'https://www.orthopaedicsone.com/', 'Collaborative orthopaedic knowledge network for musculoskeletal professionals.', 'free', ddg('orthopaedicsone.com'), 'terms: see site', 'Unique'],
  [G_UNI, 'BJSM blog', 'https://blogs.bmj.com/bjsm/', 'Sport-and-exercise-medicine commentary and summaries of new evidence.', 'free', ddg('blogs.bmj.com/bjsm'), 'terms: see site', 'Unique'],
  [G_UNI, 'Clinical Sports Medicine (Brukner & Khan)', 'https://clinicalsportsmedicine.com/', 'Companion site of the textbook used in many countries.', 'free site, paid book', null, 'terms: see site', 'Unique'],
  [G_UNI, 'Athlete365 (IOC)', 'https://www.olympics.com/athlete365', 'IOC learning for athletes: mental health, safeguarding, career, clean sport.', 'free', null, 'terms: see site', 'Unique'],
  [G_UNI, 'IPC classification', 'https://www.paralympic.org/classification', 'How Para sport classifies athletes by impairment; the base for inclusive training.', 'free', null, 'terms: see site', 'Unique'],
  [G_UNI, 'European College of Sport Science', 'https://sport-science.org/', 'Sport-science congresses, journal and position statements.', 'free + membership', null, 'terms: see site', 'Unique'],
  [G_UNI, 'Sports Medicine Australia', 'https://sma.org.au/', 'Multi-disciplinary sports-medicine body; injury-prevention and safety resources.', 'free', ddg('sma.org.au'), 'terms: see site', 'Unique'],
  [G_UNI, 'NATA (athletic trainers)', 'https://www.nata.org/', 'Professional body for athletic trainers; position statements.', 'free + membership', ddg('nata.org'), 'terms: see site', 'Unique'],
  [G_UNI, 'NHS e-Learning for Healthcare', 'https://portal.e-lfh.org.uk/', 'NHS England e-learning hub across health topics.', 'free (registration)', null, 'terms: see site', 'Unique'],
  [G_UNI, 'WHO physical activity guidelines', 'https://www.who.int/publications/i/item/9789240015128', 'WHO guidelines on physical activity and sedentary behaviour, in several languages.', 'free', null, 'licence per document', 'Unique'],
  [G_UNI, 'OpenSim Creator', 'https://www.opensimcreator.com/', 'Free desktop tool for building and editing OpenSim musculoskeletal models.', 'free', null, 'terms: see site', 'Unique'],
);

// Paid / subscription resources widely regarded as worth the cost. Links only: their content is licensed per
// subscriber and is never copied into this app. "paid" = subscription; "institutional" = usually via a hospital
// or university licence. Prices and plans change; check each site.
EXT.push(
  ['Premium: clinical decision references', 'UpToDate', 'https://www.uptodate.com/', 'Evidence-based clinical topic reviews, graded recommendations, drug interactions.', 'paid / institutional', ddg('uptodate.com'), 'subscription'],
  ['Premium: clinical decision references', 'DynaMed', 'https://www.dynamed.com/', 'Point-of-care evidence summaries with explicit evidence levels.', 'paid / institutional', ddg('dynamed.com'), 'subscription'],
  ['Premium: clinical decision references', 'BMJ Best Practice', 'https://bestpractice.bmj.com/', 'Diagnosis, treatment and follow-up pathways per condition.', 'paid / institutional', ddg('bestpractice.bmj.com'), 'subscription'],
  ['Premium: clinical decision references', 'AccessMedicine (McGraw Hill)', 'https://accessmedicine.mhmedical.com/', 'Harrison’s, Current Medical Diagnosis & Treatment, case files, images.', 'institutional', ddg('accessmedicine.mhmedical.com'), 'subscription'],
  ['Premium: clinical decision references', 'ClinicalKey (Elsevier)', 'https://www.clinicalkey.com/', 'Textbooks, journals, procedures videos, drug monographs.', 'institutional', ddg('clinicalkey.com'), 'subscription'],
  ['Premium: clinical decision references', 'Lexicomp / Micromedex', 'https://www.wolterskluwer.com/en/solutions/lexicomp', 'Drug dosing, interactions, IV compatibility.', 'paid / institutional', null, 'subscription'],
  ['Premium: imaging and anatomy', 'STATdx (Elsevier)', 'https://www.statdx.com/', 'Radiology diagnosis by imaging appearance, differentials, cases.', 'paid / institutional', null, 'subscription'],
  ['Premium: imaging and anatomy', 'IMAIOS e-Anatomy (full)', 'https://www.imaios.com/en/e-anatomy', 'Labelled CT / MRI / radiograph atlas across every region.', 'paid (free tier)', ddg('imaios.com'), 'subscription'],
  ['Premium: imaging and anatomy', 'Complete Anatomy (Elsevier 3D4Medical)', 'https://3d4medical.com/', '3D anatomy with muscles in motion, dissection, courses.', 'paid', null, 'subscription'],
  ['Premium: imaging and anatomy', 'Primal Pictures (Anatomy.tv)', 'https://www.primalpictures.com/', '3D anatomy for sport, physiotherapy and medicine.', 'institutional', null, 'subscription'],
  ['Premium: imaging and anatomy', 'Acland’s Video Atlas of Human Anatomy', 'https://aclandanatomy.com/', 'Real-specimen dissection videos.', 'paid / institutional', null, 'subscription'],
  ['Premium: imaging and anatomy', 'Radiopaedia supporter / courses', 'https://radiopaedia.org/courses', 'Structured radiology courses (the encyclopaedia itself is free).', 'paid', null, 'subscription'],
  ['Premium: learning and exams', 'AMBOSS', 'https://www.amboss.com/', 'Linked medical knowledge library and question bank.', 'paid', ddg('amboss.com'), 'subscription'],
  ['Premium: learning and exams', 'Osmosis', 'https://www.osmosis.org/', 'Short animated explainers across medicine and physiology.', 'paid (some free)', ddg('osmosis.org'), 'subscription'],
  ['Premium: learning and exams', 'Lecturio', 'https://www.lecturio.com/', 'Video lectures and question banks.', 'paid', null, 'subscription'],
  ['Premium: learning and exams', 'Sketchy', 'https://www.sketchy.com/', 'Visual mnemonics for microbiology and pharmacology.', 'paid', null, 'subscription'],
  ['Premium: sports science and rehabilitation', 'Physiopedia Plus', 'https://members.physio-pedia.com/', 'Accredited physiotherapy courses (the wiki itself is free).', 'paid', null, 'subscription'],
  ['Premium: sports science and rehabilitation', 'Orthobullets PASS / Ortho', 'https://www.orthobullets.com/', 'Orthopaedic topics, cases and question banks (core site free).', 'free tier + paid', ddg('orthobullets.com'), 'terms: see site'],
  ['Premium: sports science and rehabilitation', 'Sports Medicine (Springer) / BJSM subscription', 'https://link.springer.com/journal/40279', 'Leading sports-science reviews and consensus statements.', 'paid / institutional', ddg('link.springer.com/journal/40279'), 'licence per article'],
  ['Premium: sports science and rehabilitation', 'Human Kinetics library', 'https://us.humankinetics.com/', 'Strength & conditioning, exercise physiology and testing textbooks (NSCA, ACSM titles).', 'paid', null, 'terms: see site'],
  ['Premium: sports science and rehabilitation', 'Physitrack', 'https://www.physitrack.com/', 'Exercise-prescription library and patient app (clinician tool).', 'paid', null, 'subscription'],
  ['Premium: sports science and rehabilitation', 'VALD Performance (ForceDecks, NordBord)', 'https://valdperformance.com/', 'Force-plate and strength testing systems used for return-to-play testing.', 'paid hardware', null, 'commercial'],
  ['Premium: genomics and molecular', 'Benchling (academic free)', 'https://www.benchling.com/', 'Sequence design, plasmid maps, molecular biology notebook.', 'free academic / paid', null, 'terms: see site'],
  ['Premium: genomics and molecular', 'Ingenuity Pathway Analysis (QIAGEN)', 'https://digitalinsights.qiagen.com/products-overview/discovery-insights-portfolio/analysis-and-visualization/qiagen-ipa/', 'Curated pathway and causal network analysis.', 'paid', null, 'commercial'],
  ['Premium: genomics and molecular', 'Franklin by Genoox', 'https://franklin.genoox.com/', 'Variant interpretation with ACMG criteria (free tier).', 'free tier + paid', null, 'terms: see site'],
);

export function extLinksFor(q, groups = null) {
  const rows = EXT.filter((e) => e[5] && (!groups || groups.includes(e[0])));
  return `<div class="ext-chips">${rows.map((e) => `<a class="ext-chip" href="${esc(e[5](q))}" target="_blank" rel="noopener noreferrer" title="${esc(e[3])}">${esc(e[1])}</a>`).join('')}</div>`;
}

export function startExtensions() {
  const host = $('#ext-body'); if (!host || host.dataset.ok) return; host.dataset.ok = '1';
  const groups = [...new Set(EXT.map((e) => e[0]))];
  host.innerHTML = `<div class="ext-search"><input id="ext-q" type="search" placeholder="Search a term across every resource (e.g. ferritin, ACL tear, Lachman, psoriasis)" autocomplete="off"><span class="fine">Opens each site's own search in a new tab. Nothing is sent anywhere until you click a link.</span></div>
    <div id="ext-hits"></div>
    ${groups.map((g) => `<section class="card"><div class="card-h"><h2>${esc(g)}</h2></div><div class="ext-grid">${EXT.filter((e) => e[0] === g).map((e) => `
      <div class="ext-card"><a href="${esc(e[2])}" target="_blank" rel="noopener noreferrer"><b>${esc(e[1])}</b></a>${e[7] ? ` <span class="pill ${e[7] === 'Unique' ? 'uniq' : ''}">${esc(e[7])}</span>` : ''}
        <p class="fine">${esc(e[3])}</p><p class="fine"><span class="ext-acc ${e[4] === 'free' ? 'ok' : ''}">${esc(e[4])}</span> · ${esc(e[6])}${e[5] ? '' : ' · no search link'}</p></div>`).join('')}</div></section>`).join('')}
    <p class="fine cite">Checked on 2026-11-22: DermNet (images CC BY-NC-ND; terms ban automated harvesting), HistologyGuide, WebPath and the Rehabilitation Measures Database (all rights reserved, personal use), MedlinePlus (medical-test pages public domain). PathologyOutlines, Radiopaedia and Physiopedia did not serve their terms pages to the check. That is why these appear as links and none of their content is stored here. "Free" is what the site states today; sites can change their terms.</p>`;
  let tm = null;
  $('#ext-q').oninput = () => { clearTimeout(tm); tm = setTimeout(() => { const q = $('#ext-q').value.trim(); $('#ext-hits').innerHTML = q ? `<section class="card"><div class="card-h"><h2>Search “${esc(q)}” in</h2></div>${extLinksFor(q)}</section>` : ''; }, 200); };
}
