import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where,
  orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, adminEmail } from "./firebase-config.js";

const configured = firebaseConfig.apiKey !== "PASTE_API_KEY_HERE" &&
  firebaseConfig.projectId !== "PASTE_PROJECT_ID" &&
  adminEmail !== "YOUR_GOOGLE_EMAIL@gmail.com";
const $ = id => document.getElementById(id);
const pages = ["home","course","admin","profile"];
let app, auth, db, currentUser = null, isAdmin = false, selectedCourseId = null;
let allCourses = [], selectedCourseLessons = [], currentCourse = null, toastTimer;

$("year").textContent = new Date().getFullYear();

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function initials(name="Learner") { return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "L"; }
function showPage(page) {
  pages.forEach(p => $(p+"Page").classList.toggle("hidden", p !== page));
  document.querySelectorAll(".nav-btn[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $("hero").classList.toggle("hidden", page !== "home");
  window.scrollTo({top:0,behavior:"smooth"});
}
function setAuthUI(user) {
  currentUser = user;
  isAdmin = !!user && user.email?.toLowerCase() === adminEmail.toLowerCase();
  $("signInBtn").classList.toggle("hidden", !!user);
  $("signOutBtn").classList.toggle("hidden", !user);
  $("profileNav").classList.toggle("hidden", !user);
  $("adminNav").classList.toggle("hidden", !isAdmin);
  $("notice").classList.toggle("hidden", !!user);
  if (user) {
    $("profileDisplayName").textContent = user.displayName || "Learner";
    $("profileEmail").textContent = user.email || "";
    $("profileAvatar").textContent = initials(user.displayName || user.email || "Learner");
    $("profileName").value = user.displayName || "";
    loadUserProfile();
  }
}
function requireConfigured() {
  if (!configured) {
    toast("Setup needed: add Firebase config and your admin email in firebase-config.js.");
    return false;
  }
  return true;
}
async function init() {
  renderDemoCards();
  if (!configured) return;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, async user => {
      setAuthUI(user);
      await loadCourses();
      if (user) await recordUser(user);
      if (!user && ["admin","profile"].includes(activePage())) showPage("home");
    });
  } catch (e) {
    console.error(e);
    toast("Firebase setup error. Check firebase-config.js.");
  }
}
function activePage() {
  const visible = pages.find(p => !$(p+"Page").classList.contains("hidden"));
  return visible || "home";
}
function renderDemoCards() {
  $("courseGrid").innerHTML = `
    <article class="course-card" data-demo="true"><div class="course-cover">STEEL</div><div class="course-content"><span class="course-category">Steel Structure</span><h3>Steel Structure Fundamentals</h3><p>Sample preview. Connect Firebase and publish your own course from the Admin Board.</p><div class="course-foot"><span>Sample course</span><span>Preview</span></div></div></article>
    <article class="course-card" data-demo="true"><div class="course-cover">JIS</div><div class="course-content"><span class="course-category">JIS Standards</span><h3>JIS Standards</h3><p>Organize standards knowledge, learning notes and reference material.</p><div class="course-foot"><span>Sample preview</span><span>Preview</span></div></div></article>`;
  $("emptyCourses").classList.add("hidden");
}
async function loadCourses() {
  if (!db) return;
  try {
    const snap = await getDocs(query(collection(db,"courses"), orderBy("updatedAt","desc")));
    allCourses = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderCourses();
    if (isAdmin) renderAdminCourses();
  } catch (e) {
    console.error(e);
    toast("Could not load courses. Check Firestore rules and setup.");
  }
}
function renderCourses() {
  const term = $("courseSearch").value.trim().toLowerCase();
  const list = allCourses.filter(c => (isAdmin || c.published === true) &&
    (`${c.title||""} ${c.description||""} ${c.category||""}`).toLowerCase().includes(term));
  $("courseGrid").innerHTML = list.map(c => `
    <article class="course-card" data-course="${esc(c.id)}">
      <div class="course-cover">${c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="">` : esc((c.category||"COURSE").toUpperCase().slice(0,16))}</div>
      <div class="course-content"><span class="course-category">${esc(c.category||"Course")}</span>
      <h3>${esc(c.title||"Untitled course")}</h3><p>${esc(c.description||"No description yet.")}</p>
      <div class="course-foot"><span>${c.published ? "Published" : "Draft"}</span><span>Open course →</span></div></div>
    </article>`).join("");
  $("emptyCourses").classList.toggle("hidden", list.length > 0);
  $("courseGrid").classList.toggle("hidden", list.length === 0);
}
function renderAdminCourses() {
  $("courseCount").textContent = allCourses.length;
  $("adminCourseList").innerHTML = allCourses.map(c => `
    <div class="admin-item"><div><strong>${esc(c.title||"Untitled course")}</strong><small>${esc(c.category||"Course")} · <span class="status ${c.published?"":"draft"}">${c.published?"PUBLISHED":"DRAFT"}</span></small></div>
    <div class="item-actions"><button class="small-btn" data-action="lessons" data-id="${esc(c.id)}">Lessons</button><button class="small-btn" data-action="edit-course" data-id="${esc(c.id)}">Edit</button><button class="small-btn danger" data-action="delete-course" data-id="${esc(c.id)}">Delete</button></div></div>`).join("") || `<p class="muted">No courses yet. Create your first course using the form.</p>`;
}
async function recordUser(user) {
  if (!db) return;
  try {
    await setDoc(doc(db,"users",user.uid), {
      uid:user.uid, email:user.email||"", displayName:user.displayName||"Learner",
      photoURL:user.photoURL||"", lastSeenAt:serverTimestamp(), createdAt:serverTimestamp()
    }, {merge:true});
  } catch(e) { console.warn("User record not saved; check Firestore rules.",e); }
}
async function loadUserProfile() {
  if (!db || !currentUser) return;
  try {
    const snap = await getDoc(doc(db,"profiles",currentUser.uid));
    if (snap.exists()) $("profileBio").value = snap.data().bio || "";
  } catch(e) { console.warn(e); }
}
async function signIn() {
  if (!requireConfigured()) return;
  try { const provider = new GoogleAuthProvider(); await signInWithPopup(auth,provider); toast("Signed in successfully."); }
  catch(e) { console.error(e); toast(e.code === "auth/popup-closed-by-user" ? "Sign-in window was closed." : "Google sign-in failed. Check Firebase Authentication settings."); }
}
async function saveCourse(event) {
  event.preventDefault();
  if (!isAdmin || !db) return toast("Admin access required.");
  const id = $("editCourseId").value || crypto.randomUUID();
  const data = {
    title:$("courseTitle").value.trim(), description:$("courseDescription").value.trim(),
    category:$("courseCategory").value, imageUrl:$("courseImage").value.trim(),
    published:$("coursePublished").value === "true", updatedAt:serverTimestamp(),
    updatedBy:currentUser.uid
  };
  try {
    if (!$("editCourseId").value) data.createdAt = serverTimestamp();
    await setDoc(doc(db,"courses",id),data,{merge:true});
    resetCourseForm(); await loadCourses(); toast("Course saved.");
  } catch(e) { console.error(e); toast("Could not save course. Check Firestore rules."); }
}
function resetCourseForm() {
  $("courseForm").reset(); $("editCourseId").value=""; $("courseFormTitle").textContent="Create a course"; $("cancelCourseEdit").classList.add("hidden");
}
async function editCourse(id) {
  const c = allCourses.find(x=>x.id===id); if (!c) return;
  $("editCourseId").value=id; $("courseTitle").value=c.title||""; $("courseDescription").value=c.description||"";
  $("courseCategory").value=c.category||"Other"; $("courseImage").value=c.imageUrl||""; $("coursePublished").value=String(!!c.published);
  $("courseFormTitle").textContent="Edit course"; $("cancelCourseEdit").classList.remove("hidden");
  $("courseForm").scrollIntoView({behavior:"smooth",block:"start"});
}
async function deleteCourse(id) {
  if (!isAdmin || !confirm("Delete this course? Lessons belonging to it should also be deleted.")) return;
  try {
    const lessons = await getDocs(query(collection(db,"lessons"),where("courseId","==",id)));
    await Promise.all(lessons.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"courses",id));
    if (selectedCourseId===id) clearLessonEditor();
    await loadCourses(); toast("Course deleted.");
  } catch(e) { console.error(e); toast("Delete failed. Check Firestore rules."); }
}
async function chooseLessons(id) {
  selectedCourseId=id; currentCourse=allCourses.find(c=>c.id===id);
  $("lessonEditorEmpty").classList.add("hidden"); $("lessonEditor").classList.remove("hidden");
  $("lessonEditorHeading").textContent=`Lessons — ${currentCourse?.title||"Course"}`;
  $("editLessonId").value=""; $("lessonForm").reset(); $("lessonPublished").checked=true;
  await loadLessons();
  $("lessonPanel")?.scrollIntoView({behavior:"smooth"});
}
function clearLessonEditor() {
  selectedCourseId=null; selectedCourseLessons=[]; $("lessonEditor").classList.add("hidden"); $("lessonEditorEmpty").classList.remove("hidden");
}
async function loadLessons() {
  if (!db || !selectedCourseId) return;
  try {
    const snap=await getDocs(query(collection(db,"lessons"),where("courseId","==",selectedCourseId)));
    selectedCourseLessons=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    renderAdminLessons();
  } catch(e) { console.error(e); toast("Could not load lessons."); }
}
function renderAdminLessons() {
  $("lessonAdminList").innerHTML=selectedCourseLessons.map((l,i)=>`
    <div class="admin-item"><div><strong>${i+1}. ${esc(l.title||"Untitled lesson")}</strong><small><span class="status ${l.published?"":"draft"}">${l.published?"PUBLISHED":"DRAFT"}</span></small></div>
    <div class="item-actions"><button class="small-btn" data-action="edit-lesson" data-id="${esc(l.id)}">Edit</button><button class="small-btn danger" data-action="delete-lesson" data-id="${esc(l.id)}">Delete</button></div></div>`).join("") || `<p class="muted">No lessons yet. Add the first lesson above.</p>`;
}
async function saveLesson(event) {
  event.preventDefault();
  if (!isAdmin || !db || !selectedCourseId) return toast("Choose a course first.");
  const id=$("editLessonId").value||crypto.randomUUID();
  const data={
    courseId:selectedCourseId,title:$("lessonTitle").value.trim(),text:$("lessonText").value.trim(),
    imageUrl:$("lessonImage").value.trim(),videoUrl:$("lessonVideo").value.trim(),pdfUrl:$("lessonPdf").value.trim(),
    published:$("lessonPublished").checked,order:$("editLessonId").value?(selectedCourseLessons.find(l=>l.id===$("editLessonId").value)?.order||0):selectedCourseLessons.length,
    updatedAt:serverTimestamp(),updatedBy:currentUser.uid
  };
  try {
    if (!$("editLessonId").value) data.createdAt=serverTimestamp();
    await setDoc(doc(db,"lessons",id),data,{merge:true});
    $("lessonForm").reset(); $("editLessonId").value=""; $("lessonPublished").checked=true;
    await loadLessons(); toast("Lesson saved.");
  } catch(e) { console.error(e); toast("Could not save lesson. Check Firestore rules."); }
}
function editLesson(id) {
  const l=selectedCourseLessons.find(x=>x.id===id); if(!l)return;
  $("editLessonId").value=id;$("lessonTitle").value=l.title||"";$("lessonText").value=l.text||"";
  $("lessonImage").value=l.imageUrl||"";$("lessonVideo").value=l.videoUrl||"";$("lessonPdf").value=l.pdfUrl||"";
  $("lessonPublished").checked=!!l.published;$("cancelLessonEdit").classList.remove("hidden");
  $("lessonForm").scrollIntoView({behavior:"smooth",block:"start"});
}
async function deleteLesson(id) {
  if(!confirm("Delete this lesson?"))return;
  try { await deleteDoc(doc(db,"lessons",id));await loadLessons();toast("Lesson deleted."); }
  catch(e){console.error(e);toast("Delete failed.");}
}
async function openCourse(id) {
  const course=allCourses.find(c=>c.id===id);if(!course)return;
  if(!isAdmin && !course.published)return toast("This course is not published yet.");
  currentCourse=course;
  let lessons=[];
  if(db) {
    try {
      const snap=await getDocs(query(collection(db,"lessons"),where("courseId","==",id)));
      lessons=snap.docs.map(d=>({id:d.id,...d.data()})).filter(l=>isAdmin||l.published).sort((a,b)=>(a.order||0)-(b.order||0));
    }catch(e){console.error(e);}
  }
  $("courseDetail").innerHTML=`
    <div class="course-detail-head"><div class="course-cover">${course.imageUrl?`<img src="${esc(course.imageUrl)}" alt="">`:esc((course.category||"COURSE").toUpperCase().slice(0,16))}</div>
    <div><span class="course-category">${esc(course.category||"Course")}</span><h2>${esc(course.title||"Untitled course")}</h2><p class="muted">${esc(course.description||"")}</p><p class="muted">${lessons.length} lesson(s)</p></div></div>
    <div class="lesson-list">${lessons.map((l,i)=>`<div class="lesson-row"><div><h3>${i+1}. ${esc(l.title||"Untitled lesson")}</h3><p>${esc((l.text||"").slice(0,120))}${(l.text||"").length>120?"…":""}</p></div><button class="lesson-open" data-open-lesson="${esc(l.id)}">Open lesson →</button></div>`).join("") || `<div class="empty-state"><h3>No published lessons yet</h3><p>Admin can add lessons from the Admin Board.</p></div>`}</div><div id="openedLesson"></div>`;
  showPage("course");
  window.currentOpenedLessons=lessons;
}
function renderLesson(id) {
  const l=(window.currentOpenedLessons||[]).find(x=>x.id===id);if(!l)return;
  let videoHtml="";
  if(l.videoUrl) {
    const yt=l.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    videoHtml=yt?`<iframe class="video-frame" src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Lesson video" allowfullscreen loading="lazy"></iframe>`:`<p><a class="resource-link" href="${esc(l.videoUrl)}" target="_blank" rel="noopener">▶ Open video</a></p>`;
  }
  $("openedLesson").innerHTML=`<article class="lesson-content"><p class="eyebrow">LESSON</p><h2>${esc(l.title||"Untitled lesson")}</h2><div class="lesson-text">${esc(l.text||"")}</div>${l.imageUrl?`<img class="lesson-image" src="${esc(l.imageUrl)}" alt="Lesson image">`:""}${videoHtml}${l.pdfUrl?`<p><a class="resource-link" href="${esc(l.pdfUrl)}" target="_blank" rel="noopener">↗ Open PDF / learning resource</a></p>`:""}<button class="secondary-btn" id="markComplete">Mark as complete</button><span id="completeMessage" class="muted"></span></article>`;
  $("markComplete").addEventListener("click",async()=>{
    if(!currentUser||!db){toast("Sign in to save your progress.");return;}
    try{await setDoc(doc(db,"progress",`${currentUser.uid}_${l.id}`),{uid:currentUser.uid,lessonId:l.id,courseId:selectedOrCurrentCourseId(),completed:true,completedAt:serverTimestamp()});$("completeMessage").textContent=" ✓ Completed";toast("Progress saved.");}
    catch(e){console.error(e);toast("Could not save progress.");}
  });
}
function selectedOrCurrentCourseId(){return currentCourse?.id||selectedCourseId||"";}
async function saveProfile(event) {
  event.preventDefault();if(!currentUser||!db)return;
  const name=$("profileName").value.trim(),bio=$("profileBio").value.trim();
  try {
    await updateProfile(currentUser,{displayName:name});
    await setDoc(doc(db,"profiles",currentUser.uid),{uid:currentUser.uid,bio,displayName:name,updatedAt:serverTimestamp()},{merge:true});
    await setDoc(doc(db,"users",currentUser.uid),{uid:currentUser.uid,email:currentUser.email||"",displayName:name,photoURL:currentUser.photoURL||"",lastSeenAt:serverTimestamp()},{merge:true});
    $("profileDisplayName").textContent=name;$("profileAvatar").textContent=initials(name);toast("Profile updated.");
  }catch(e){console.error(e);toast("Could not save profile. Check Firestore rules.");}
}
async function loadUsers() {
  if(!isAdmin||!db)return;
  try {
    const snap=await getDocs(query(collection(db,"users"),orderBy("lastSeenAt","desc"),limit(100)));
    $("userList").innerHTML=snap.docs.map(d=>{const u=d.data();return `<div class="user-row"><div><strong>${esc(u.displayName||"Learner")}</strong><br><span class="muted">${esc(u.email||"")}</span></div><span class="muted">User</span></div>`;}).join("")||`<p class="muted">No users recorded yet.</p>`;
  }catch(e){console.error(e);toast("Could not load users. Check Firestore rules.");}
}

$("signInBtn").addEventListener("click",signIn);
$("signOutBtn").addEventListener("click",async()=>{if(auth)await signOut(auth);showPage("home");toast("Signed out.");});
document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.addEventListener("click",()=>{
  const page=b.dataset.page;
  if(page==="admin"&&!isAdmin)return toast("Admin access only.");
  if(page==="profile"&&!currentUser)return toast("Please sign in first.");
  showPage(page);
  if(page==="admin") {renderAdminCourses();loadUsers();}
}));
$("brandHome").addEventListener("click",e=>{e.preventDefault();showPage("home");});
$("courseSearch").addEventListener("input",renderCourses);
$("courseGrid").addEventListener("click",e=>{
  const card=e.target.closest("[data-course]");
  if(card)openCourse(card.dataset.course);
  else if(e.target.closest("[data-demo]"))toast("Demo preview only. Connect Firebase and add your course.");
});
$("backToCourses").addEventListener("click",()=>showPage("home"));
$("courseForm").addEventListener("submit",saveCourse);
$("cancelCourseEdit").addEventListener("click",resetCourseForm);
$("adminCourseList").addEventListener("click",e=>{
  const b=e.target.closest("[data-action]");if(!b)return;
  if(b.dataset.action==="edit-course")editCourse(b.dataset.id);
  if(b.dataset.action==="lessons")chooseLessons(b.dataset.id);
  if(b.dataset.action==="delete-course")deleteCourse(b.dataset.id);
});
$("lessonForm").addEventListener("submit",saveLesson);
$("cancelLessonEdit").addEventListener("click",()=>{$("lessonForm").reset();$("editLessonId").value="";$("lessonPublished").checked=true;$("cancelLessonEdit").classList.add("hidden");});
$("lessonAdminList").addEventListener("click",e=>{
  const b=e.target.closest("[data-action]");if(!b)return;
  if(b.dataset.action==="edit-lesson")editLesson(b.dataset.id);
  if(b.dataset.action==="delete-lesson")deleteLesson(b.dataset.id);
});
$("courseDetail").addEventListener("click",e=>{
  const b=e.target.closest("[data-open-lesson]");if(b)renderLesson(b.dataset.openLesson);
});
$("profileForm").addEventListener("submit",saveProfile);
$("refreshUsers").addEventListener("click",loadUsers);
document.querySelectorAll(".tab-btn").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab-btn").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.toggle("hidden",x.id!==b.dataset.tab));
}));
init();
