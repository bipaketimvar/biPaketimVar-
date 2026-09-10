// =====================================================
// biPAKETIMVAR - FIREBASE.JS
// Kurye + Admin panelleri ile uyumlu ortak Firebase katmanı
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// -----------------------------------------------------
// FIREBASE AYARLARI
// -----------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyATFYjrsncqTOGv6I660xxoI2rYtOr_DW4",
    authDomain: "paketimvarsamsun.firebaseapp.com",
    projectId: "paketimvarsamsun",
    storageBucket: "paketimvarsamsun.firebasestorage.app",
    messagingSenderId: "741800881382",
    appId: "1:741800881382:web:09c688a96d43292a171f27",
    measurementId: "G-39C1FCNGL2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =====================================================
// YARDIMCI FONKSİYONLAR
// =====================================================

const text = value => String(value ?? "").trim();

const numberValue = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

function getBusinessAddress(data = {}) {
    return text(
        data.isletmeAdresi ||
        data.adres ||
        data.alisAdresi ||
        data.cikisAdresi
    );
}

function getDeliveryAddress(data = {}) {
    return text(
        data.teslimatAdresi ||
        data.varisAdresi ||
        data.musteriAdresi ||
        data.musteriAdres ||
        data.customerAddress
    );
}

function getCustomerName(data = {}) {
    return text(
        data.musteriAdi ||
        data.musteriAdSoyad ||
        data.aliciAd ||
        data.customerName
    );
}

function getCustomerPhone(data = {}) {
    return text(
        data.musteriTelefon ||
        data.aliciTelefon ||
        data.customerPhone
    );
}

function normalizeStatus(status) {
    const value = text(status).toLocaleLowerCase("tr-TR");

    if (
        value === "teslim_edildi" ||
        value === "teslim edildi" ||
        value === "teslimedildi" ||
        value === "delivered"
    ) {
        return "teslim_edildi";
    }

    if (
        value === "iptal" ||
        value === "cancelled" ||
        value === "canceled"
    ) {
        return "iptal";
    }

    if (
        value === "paket_alindi" ||
        value === "paket alindi" ||
        value === "teslimat_hazir" ||
        value === "yolda_musteriye" ||
        value === "kurye_atandi" ||
        value === "teslimata_cikti" ||
        value === "accepted" ||
        value === "picked" ||
        value === "in_delivery" ||
        value === "dagitimda" ||
        value === "yolda"
    ) {
        return "yolda";
    }

    return "bekliyor";
}

// =====================================================
// 1. İŞLETME KAYDI
// =====================================================

export async function isletmeKayitEt(email, sifre, isletmeFormu = {}) {
    const cleanEmail = text(email).toLowerCase();

    if (!cleanEmail) throw new Error("E-posta adresi gerekli.");
    if (!sifre || String(sifre).length < 6) {
        throw new Error("Şifre en az 6 karakter olmalıdır.");
    }

    try {
        const credential = await createUserWithEmailAndPassword(
            auth,
            cleanEmail,
            sifre
        );

        const user = credential.user;
        const uid = user.uid;

        const isletmeAdi = text(
            isletmeFormu.isletmeAdi ||
            isletmeFormu.ad ||
            isletmeFormu.adSoyad
        );

        const telefon = text(
            isletmeFormu.telefon ||
            isletmeFormu.phone
        );

        const adres = text(
            isletmeFormu.isletmeAdresi ||
            isletmeFormu.adres
        );

        // Auth profilinde isim de tutulur.
        if (isletmeAdi) {
            try {
                await updateProfile(user, { displayName: isletmeAdi });
            } catch (profileError) {
                console.warn("Auth displayName güncellenemedi:", profileError);
            }
        }

        const lat = numberValue(isletmeFormu.lat, 41.3072268);
        const lng = numberValue(isletmeFormu.lng, 36.3068144);

        const isletmeData = {
            uid,
            tip: "isletme",
            role: "business",
            active: true,

            ad: isletmeAdi,
            adSoyad: isletmeAdi,
            isletmeAdi,

            email: cleanEmail,
            telefon,
            phone: telefon,

            isletmeAdresi: adres,
            adres,

            konum: { lat, lng },

            // İlk 10 sipariş ücretsiz.
            freeOrdersUsed: 0,
            ucretsizKullanilan: 0,
            ucretsizSiparis: 0,

            // Ücretli kullanım bakiyesi.
            tokens: 0,
            jeton: 0,
            jetons: 0,

            tarih: serverTimestamp(),
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, "kullanicilar", uid), isletmeData);

        return uid;
    } catch (error) {
        console.error("İşletme kayıt hatası:", error);
        throw error;
    }
}

// =====================================================
// 2. PAKET EKLE - İŞLETME
// =====================================================

export async function paketEkle(teslimatFormu = {}) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Oturum açmış kullanıcı bulunamadı!");
    }

    try {
        const userRef = doc(db, "kullanicilar", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            throw new Error("İşletme profili bulunamadı!");
        }

        const uData = userSnap.data();

        if (
            uData.tip !== "isletme" &&
            uData.role !== "business"
        ) {
            throw new Error("Bu hesap paket oluşturma yetkisine sahip değil.");
        }

        if (uData.active === false) {
            throw new Error("İşletme hesabı pasif durumda.");
        }

        const alisAdresi = getBusinessAddress(uData);
        const teslimatAdresi = getDeliveryAddress(teslimatFormu);
        const musteriAdi = getCustomerName(teslimatFormu);
        const musteriTelefon = getCustomerPhone(teslimatFormu);

        if (!musteriAdi) {
            throw new Error("Müşteri adı gerekli.");
        }

        if (!teslimatAdresi) {
            throw new Error("Teslimat adresi gerekli.");
        }

        const siparisTutari = Math.max(
            0,
            numberValue(
                teslimatFormu.siparisTutari ??
                teslimatFormu.orderAmount ??
                teslimatFormu.tutar
            )
        );

        const kuryeUcreti = Math.max(
            0,
            numberValue(
                teslimatFormu.kuryeUcreti ??
                teslimatFormu.courierFee ??
                teslimatFormu.ucret,
                110
            )
        );

        // -------------------------------------------------
        // İlk 10 sipariş ücretsiz, sonrası 1 jeton.
        // İşletme tarafında ücretlendirme atomik işlemle yapılır.
        // -------------------------------------------------
        let newPackageId = "";

        await runTransaction(db, async transaction => {
            const freshUserSnap = await transaction.get(userRef);

            if (!freshUserSnap.exists()) {
                throw new Error("İşletme hesabı bulunamadı.");
            }

            const fresh = freshUserSnap.data();

            const freeUsed = Math.max(
                0,
                numberValue(
                    fresh.freeOrdersUsed ??
                    fresh.ucretsizKullanilan ??
                    fresh.ucretsizSiparis,
                    0
                )
            );

            const tokenBalance = Math.max(
                0,
                numberValue(
                    fresh.tokens ??
                    fresh.jeton ??
                    fresh.jetons,
                    0
                )
            );

            const usingFree = freeUsed < 10;

            if (!usingFree && tokenBalance < 1) {
                throw new Error(
                    "İlk 10 ücretsiz siparişiniz tamamlandı. Yeni paket oluşturmak için jeton gereklidir."
                );
            }

            const paketRef = doc(collection(db, "paketler"));

            const yeniPaket = {
                paketKodu: paketRef.id.slice(-6).toUpperCase(),

                isletmeId: user.uid,
                businessId: user.uid,

                isletmeAdi:
                    text(fresh.isletmeAdi) ||
                    text(fresh.ad) ||
                    "İşletme",

                alisAdresi,
                cikisAdresi: alisAdresi,
                isletmeAdresi: alisAdresi,
                adres: alisAdresi,

                konum: fresh.konum || null,

                musteriAdi,
                musteriAdSoyad: musteriAdi,
                aliciAd: musteriAdi,

                musteriTelefon,
                aliciTelefon: musteriTelefon,
                customerPhone: musteriTelefon,

                teslimatAdresi,
                varisAdresi: teslimatAdresi,
                musteriAdresi: teslimatAdresi,
                musteriAdres: teslimatAdresi,
                customerAddress: teslimatAdresi,

                paketIcerik:
                    text(
                        teslimatFormu.paketIcerik ??
                        teslimatFormu.aciklama
                    ),

                kuryeNotu:
                    text(
                        teslimatFormu.kuryeNotu ??
                        teslimatFormu.not
                    ),

                siparisTutari,
                orderAmount: siparisTutari,
                tutar: siparisTutari,

                kuryeUcreti,
                courierFee: kuryeUcreti,
                ucret: kuryeUcreti,

                odemeTipi:
                    text(
                        teslimatFormu.odemeTipi ??
                        teslimatFormu.paymentMethod
                    ) || "Nakit",

                paymentMethod:
                    text(
                        teslimatFormu.odemeTipi ??
                        teslimatFormu.paymentMethod
                    ) || "Nakit",

                kuryeId: null,
                kuryeAdi: null,

                durum: "bekliyor",
                status: "bekliyor",

                ucretsizMi: usingFree,
                freeOrder: usingFree,

                olusturmaTarihi: serverTimestamp(),
                createdAt: serverTimestamp(),
                guncellenmeTarihi: serverTimestamp()
            };

            transaction.set(paketRef, yeniPaket);

            if (usingFree) {
                const nextFree = freeUsed + 1;

                transaction.update(userRef, {
                    freeOrdersUsed: nextFree,
                    ucretsizKullanilan: nextFree,
                    ucretsizSiparis: nextFree
                });
            } else {
                const nextTokens = tokenBalance - 1;

                transaction.update(userRef, {
                    tokens: nextTokens,
                    jeton: nextTokens,
                    jetons: nextTokens
                });
            }

            newPackageId = paketRef.id;
        });

        return newPackageId;
    } catch (error) {
        console.error("Paket ekleme hatası:", error);
        throw error;
    }
}

// =====================================================
// 3. GÜVENLİ PAKET ÜSTLENME - KURYE
// =====================================================

export async function paketiUstlenSafe(paketId) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Lütfen önce giriş yapın!");
    }

    if (!paketId) {
        throw new Error("Paket ID bulunamadı.");
    }

    const paketRef = doc(db, "paketler", paketId);

    try {
        await runTransaction(db, async transaction => {
            const paketDoc = await transaction.get(paketRef);

            if (!paketDoc.exists()) {
                throw new Error("Bu paket sistemde bulunamadı!");
            }

            const paketData = paketDoc.data();
            const currentStatus = normalizeStatus(
                paketData.durum || paketData.status
            );

            if (currentStatus !== "bekliyor") {
                throw new Error(
                    "Bu paket başka bir kurye tarafından az önce alındı!"
                );
            }

            if (paketData.kuryeId) {
                throw new Error(
                    "Bu paket başka bir kuryeye kilitlenmiş!"
                );
            }

            transaction.update(paketRef, {
                durum: "yolda",
                status: "yolda",

                kuryeId: user.uid,
                kuryeAdi: user.displayName || "Kurye",

                kuryeAtamaTarihi: serverTimestamp(),
                guncellenmeTarihi: serverTimestamp()
            });
        });

        return true;
    } catch (error) {
        console.error("Paket üstlenme hatası:", error);
        throw error;
    }
}

// =====================================================
// 4. KURYE HAVUZUNU DİNLE
// =====================================================

export function kuryeHavuzunuDinle(callback) {
    if (typeof callback !== "function") {
        throw new Error("Callback fonksiyonu gerekli.");
    }

    const q = query(
        collection(db, "paketler"),
        where("durum", "==", "bekliyor")
    );

    return onSnapshot(
        q,
        snapshot => {
            const paketler = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();

                const alisAdres =
                    data.alisAdresi ||
                    data.cikisAdresi ||
                    data.isletmeAdresi ||
                    data.adres ||
                    "";

                const teslimatAdres =
                    data.teslimatAdresi ||
                    data.varisAdresi ||
                    data.musteriAdresi ||
                    data.musteriAdres ||
                    data.customerAddress ||
                    "";

                paketler.push({
                    id: docSnap.id,
                    ...data,

                    gorunenAlisAdresi:
                        alisAdres && alisAdres !== "."
                            ? alisAdres
                            : "Alış Adresi Belirtilmedi",

                    gorunenTeslimatAdresi:
                        teslimatAdres && teslimatAdres !== "."
                            ? teslimatAdres
                            : "Teslimat Adresi Belirtilmedi"
                });
            });

            callback(paketler);
        },
        error => {
            console.error("Kurye havuzu dinleme hatası:", error);
        }
    );
}

// =====================================================
// 5. KURYE AKTİF + HAVUZ PAKETLERİNİ DİNLE
// =====================================================

export function kuryePaketleriniDinle(kuryeUid, callback) {
    if (!kuryeUid) {
        throw new Error("Kurye UID gerekli.");
    }

    if (typeof callback !== "function") {
        throw new Error("Callback fonksiyonu gerekli.");
    }

    try {
        const q = collection(db, "paketler");

        return onSnapshot(
            q,
            snapshot => {
                const paketler = [];

                snapshot.forEach(docSnap => {
                    const data = docSnap.data();

                    const pKuryeId = data.kuryeId || "";
                    const pDurum = normalizeStatus(
                        data.durum || data.status
                    );

                    const isPool = !pKuryeId;
                    const isAssignedToMe = pKuryeId === kuryeUid;
                    const isCompleted =
                        pDurum === "teslim_edildi" ||
                        pDurum === "iptal";

                    const alisAdres =
                        data.alisAdresi ||
                        data.cikisAdresi ||
                        data.isletmeAdresi ||
                        data.adres ||
                        "";

                    const teslimatAdres =
                        data.teslimatAdresi ||
                        data.varisAdresi ||
                        data.musteriAdresi ||
                        data.musteriAdres ||
                        data.customerAddress ||
                        "";

                    if (
                        isPool ||
                        (isAssignedToMe && !isCompleted)
                    ) {
                        paketler.push({
                            id: docSnap.id,
                            ...data,

                            gorunenAlisAdresi:
                                alisAdres && alisAdres !== "."
                                    ? alisAdres
                                    : "Alış Adresi Belirtilmedi",

                            gorunenTeslimatAdresi:
                                teslimatAdres && teslimatAdres !== "."
                                    ? teslimatAdres
                                    : "Teslimat Adresi Belirtilmedi"
                        });
                    }
                });

                paketler.sort((a, b) => {
                    const timeA =
                        a.olusturmaTarihi?.toMillis?.() ||
                        a.createdAt?.toMillis?.() ||
                        0;

                    const timeB =
                        b.olusturmaTarihi?.toMillis?.() ||
                        b.createdAt?.toMillis?.() ||
                        0;

                    return timeB - timeA;
                });

                callback(paketler);
            },
            error => {
                console.error(
                    "Kurye paket dinleme hatası:",
                    error
                );
            }
        );
    } catch (error) {
        console.error(
            "kuryePaketleriniDinle başlatılamadı:",
            error
        );
        throw error;
    }
}

// =====================================================
// 6. KURYE GEÇMİŞİ
// =====================================================

export async function kuryeGecmisPaketleriniGetir(kuryeUid) {
    if (!kuryeUid) return [];

    try {
        // Eski ve yeni kayıtlarla uyumlu olmak için tüm paketleri okuyup
        // kuryeId / courierId / assignedCourierId alanlarından eşleştiriyoruz.
        // Böylece geçmişte oluşturulmuş paketler de kaybolmaz.
        const snapshot = await getDocs(collection(db, "paketler"));
        const gecmis = [];
        const uid = String(kuryeUid);

        snapshot.forEach(docSnap => {
            const data = docSnap.data() || {};
            const assignedUid = String(
                data.kuryeId ?? data.courierId ?? data.assignedCourierId ?? ""
            ).trim();

            const durum = normalizeStatus(data.durum ?? data.status ?? "");

            if (assignedUid === uid && (durum === "teslim_edildi" || durum === "iptal")) {
                gecmis.push({ id: docSnap.id, ...data });
            }
        });

        gecmis.sort((a, b) => {
            const timeA =
                a.guncellenmeTarihi?.toMillis?.() ||
                a.teslimTarihi?.toMillis?.() ||
                a.updatedAt?.toMillis?.() ||
                a.olusturmaTarihi?.toMillis?.() ||
                a.createdAt?.toMillis?.() || 0;
            const timeB =
                b.guncellenmeTarihi?.toMillis?.() ||
                b.teslimTarihi?.toMillis?.() ||
                b.updatedAt?.toMillis?.() ||
                b.olusturmaTarihi?.toMillis?.() ||
                b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

        return gecmis;
    } catch (error) {
        console.error("Geçmiş paketleri çekilemedi:", error);
        throw error;
    }
}

// =====================================================
// 7. KURYE DURUM GÜNCELLEME
// =====================================================

export async function kuryeAdimGuncelle(paketId, yeniDurum) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Oturum açılmamış!");
    }

    if (!paketId) {
        throw new Error("Paket ID bulunamadı.");
    }

    const durum = normalizeStatus(yeniDurum);
    const paketRef = doc(db, "paketler", paketId);

    await runTransaction(db, async transaction => {
        const paketDoc = await transaction.get(paketRef);

        if (!paketDoc.exists()) {
            throw new Error("Paket bulunamadı.");
        }

        const data = paketDoc.data();

        if (
            data.kuryeId &&
            data.kuryeId !== user.uid
        ) {
            throw new Error(
                "Bu paket üzerinde yetkiniz bulunmuyor."
            );
        }

        // Kurye teslimata geçtiyse paketin kurye bağlantısı korunur.
        transaction.update(paketRef, {
            durum,
            status: durum,
            guncellenmeTarihi: serverTimestamp(),

            ...(durum === "teslim_edildi"
                ? {
                    teslimTarihi: serverTimestamp()
                }
                : {})
        });
    });

    return true;
}

// =====================================================
// 8. KURYE/İŞLETME HESABI GÜNCELLEME YARDIMCILARI
// =====================================================

export async function kullaniciGetir(uid) {
    const id = uid || auth.currentUser?.uid;

    if (!id) return null;

    const snap = await getDoc(
        doc(db, "kullanicilar", id)
    );

    if (!snap.exists()) return null;

    return {
        id: snap.id,
        ...snap.data()
    };
}

export async function kullaniciGuncelle(uid, data = {}) {
    const id = uid || auth.currentUser?.uid;

    if (!id) {
        throw new Error("Kullanıcı ID bulunamadı.");
    }

    await updateDoc(
        doc(db, "kullanicilar", id),
        {
            ...data,
            guncellenmeTarihi: serverTimestamp()
        }
    );

    return true;
}

// =====================================================
// 9. MODÜL DIŞA AKTARIMLARI
// Admin.html bu Firestore fonksiyonlarını doğrudan kullanıyor.
// =====================================================

export {
    auth,
    db,

    // Auth
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,

    // Firestore
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    increment,
    runTransaction
};
