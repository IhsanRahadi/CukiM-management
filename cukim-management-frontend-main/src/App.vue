<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import Swal from 'sweetalert2'

const API_URL = `http://${window.location.hostname}:5000/api`

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================

const isLoading = ref(true)

// Auth State
const isLoggedIn = ref(!!localStorage.getItem('token'))
const token = ref(localStorage.getItem('token') || '')
const currentUser = ref(JSON.parse(localStorage.getItem('user_data') || '{}')) // Digunakan untuk menyimpan data admin/staff
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')

// Navigation & UI State
const activeTab = ref('dashboard') // 'dashboard' | 'vault' | 'users' | 'systems' | 'logs' | 'manage-admins'
const showModalUser = ref(false)
const showModalSystem = ref(false)
const showModalAccess = ref(false)
const showModalAdmin = ref(false)
const showModalAddAdmin = ref(false)
const showModalEditUser = ref(false)
const showModalEditAccess = ref(false)
const showModalEditSystem = ref(false)

// Search State
const searchUser = ref('')
const searchSystem = ref('')
const searchAccess = ref('')
const searchAdmin = ref('')

// Data State
const users = ref([])
const systems = ref([])
const accesses = ref([])
const auditLogs = ref([])
const adminList = ref([])
const staffAccessList = ref([])

// Form State
const newUser = ref({ nik: '', nama: '', divisi: '' })
const newSystem = ref({ nama_sistem: '', deskripsi: '', url_sistem: '' })
const newAccess = ref({ user_id: '', system_id: '', username_sistem: '', raw_password: '', role_akses: '' })
const newAdminForm = ref({ username: '', password: '', nama_admin: '', role: 'admin' })

const editUserData = ref({ id: null, nik: '', nama: '', divisi: '', status: '' })
const editAccessData = ref({ id: null, username_sistem: '', raw_password: '', role_akses: '' })
const editSystemData = ref({ id: null, nama_sistem: '', deskripsi: '', url_sistem: '' })

// Auto-Hide Password & Timer State
const decryptedPasswords = ref({})
const timers = ref({})
const intervals = ref({})

const getAuthHeader = () => ({
  headers: { Authorization: `Bearer ${token.value}` }
})

// ==========================================
// 2. COMPUTED PROPERTIES
// ==========================================

const filteredUsers = computed(() => {
  const query = searchUser.value.toLowerCase()
  return users.value.filter(u => 
    u.nama.toLowerCase().includes(query) || 
    u.nik.toLowerCase().includes(query) || 
    (u.divisi && u.divisi.toLowerCase().includes(query))
  )
})

const filteredSystems = computed(() => {
  const query = searchSystem.value.toLowerCase()
  return systems.value.filter(s => 
    s.nama_sistem.toLowerCase().includes(query) || 
    (s.deskripsi && s.deskripsi.toLowerCase().includes(query))
  )
})

const filteredAccesses = computed(() => {
  const query = searchAccess.value.toLowerCase()
  return accesses.value.filter(a => 
    a.nama.toLowerCase().includes(query) || 
    a.nama_sistem.toLowerCase().includes(query) || 
    a.username_sistem.toLowerCase().includes(query) || 
    a.role_akses.toLowerCase().includes(query)
  )
})

const filteredAdmins = computed(() => {
  const query = searchAdmin.value.toLowerCase()
  return adminList.value.filter(a => 
    a.nama_admin.toLowerCase().includes(query) || 
    a.username.toLowerCase().includes(query)
  )
})

const totalDivisi = computed(() => {
  const divisiList = users.value
    .map(u => u.divisi ? u.divisi.trim().toLowerCase() : null)
    .filter(d => d)
  return new Set(divisiList).size
})
const totalUsers = computed(() => users.value.length)
const totalSystems = computed(() => systems.value.length)
const totalAccesses = computed(() => accesses.value.length)
const todayLogsCount = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return auditLogs.value.filter(log => log.created_at.startsWith(today)).length
})

// ==========================================
// 3. FETCH DATA LOGIC
// ==========================================

const loadInitialData = () => {
  if (!isLoggedIn.value) return
  
  if (currentUser.value.role === 'staff') {
    fetchStaffAccess()
  } else {
    fetchData()
    if (currentUser.value.role === 'superadmin') {
      fetchAdmins()
    }
  }
}

const fetchData = async () => {
  if (!token.value) return
  isLoading.value = true
  try {
    const [resUsers, resSystems, resAccess, resLogs] = await Promise.all([
      axios.get(`${API_URL}/users`, getAuthHeader()),
      axios.get(`${API_URL}/systems`, getAuthHeader()),
      axios.get(`${API_URL}/access`, getAuthHeader()),
      axios.get(`${API_URL}/audit-logs`, getAuthHeader())
    ])
    users.value = resUsers.data.data
    systems.value = resSystems.data.data
    accesses.value = resAccess.data.data
    auditLogs.value = resLogs.data.data
    isLoggedIn.value = true
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      handleLogout()
    }
  } finally {
    isLoading.value = false
  }
}

const fetchAdmins = async () => {
  try {
    const res = await axios.get(`${API_URL}/admins`, getAuthHeader())
    adminList.value = res.data.data
  } catch (err) {
    console.error('Gagal mengambil data admin:', err)
  }
}

const fetchStaffAccess = async () => {
  try {
    const res = await axios.get(`${API_URL}/staff/my-access`, getAuthHeader())
    staffAccessList.value = res.data.data
  } catch (err) {
    console.error('Gagal mengambil vault staff:', err)
  }
}

onMounted(() => {
  loadInitialData()
})

// ==========================================
// 4. AUTHENTICATION HANDLERS
// ==========================================

const handleLogin = async () => {
  loginError.value = ''
  try {
    const res = await axios.post(`${API_URL}/auth/login`, loginForm.value)
    token.value = res.data.token
    currentUser.value = res.data.user || res.data.admin // Disesuaikan dengan struktur respons backend
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user_data', JSON.stringify(currentUser.value))
    isLoggedIn.value = true
    loadInitialData()
  } catch (err) {
    loginError.value = err.response?.data?.message || 'Login Gagal!'
  }
}

const handleLogout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user_data')
  localStorage.removeItem('adminInfo') // Hapus key lama jika masih ada
  token.value = ''
  currentUser.value = {}
  isLoggedIn.value = false
}

// ==========================================
// 5. PASSWORD DECRYPT & TIMERS
// ==========================================

const handleViewPassword = async (accessId) => {
  if (decryptedPasswords.value[accessId]) {
    hidePassword(accessId)
    return
  }
  try {
    const res = await axios.post(`${API_URL}/access/decrypt`, { account_id: accessId }, getAuthHeader())
    decryptedPasswords.value[accessId] = res.data.decrypted_password
    timers.value[accessId] = 10

    if (intervals.value[accessId]) clearInterval(intervals.value[accessId])

    intervals.value[accessId] = setInterval(() => {
      if (timers.value[accessId] > 1) {
        timers.value[accessId]--
      } else {
        hidePassword(accessId)
      }
    }, 1000)
    
    // Refresh log setelah melihat password
    if(currentUser.value.role !== 'staff') {
        fetchData()
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Oops...', text: 'Gagal mengambil password: ' + (err.response?.data?.message || err.message), background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
  }
}

const hidePassword = (accessId) => {
  delete decryptedPasswords.value[accessId]
  delete timers.value[accessId]
  if (intervals.value[accessId]) {
    clearInterval(intervals.value[accessId])
    delete intervals.value[accessId]
  }
}

onUnmounted(() => {
  Object.keys(intervals.value).forEach(id => clearInterval(intervals.value[id]))
})


// ==========================================
// 6. CRUD HANDLERS (CREATE, UPDATE, DELETE)
// ==========================================

// Konfigurasi Notifikasi Melayang (Toast)
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  background: '#1e293b', // Warna slate-800
  color: '#ffffff'
})

// Fungsi Toast Baru
const showToast = (message, type = 'success') => {
  Toast.fire({
    icon: type, // 'success', 'error', 'warning', 'info'
    title: message
  })
}

// ---- USERS ----
const handleAddUser = async () => {
  if (!newUser.value.nik || !newUser.value.nama) return
  await axios.post(`${API_URL}/users`, newUser.value, getAuthHeader())
  newUser.value = { nik: '', nama: '', divisi: '' }
  showModalUser.value = false
  fetchData()
}

const openEditUserModal = (user) => {
  editUserData.value = { ...user }
  showModalEditUser.value = true
}

const handleUpdateUser = async () => {
  try {
    await axios.put(`${API_URL}/users/${editUserData.value.id}`, editUserData.value, getAuthHeader())
    showToast('Data pegawai berhasil diperbarui!', 'success')
    showModalEditUser.value = false
    fetchData()
  } catch (err) {
    showToast('Gagal memperbarui data user: ' + (err.response?.data?.message || err.message), 'error')
  }
}

const handleDeleteUser = async (user) => {
  const result = await Swal.fire({
    title: 'Hapus Pegawai?',
    text: `Anda yakin ingin menghapus "${user.nama}" beserta seluruh hak aksesnya?`,
    icon: 'warning',
    showCancelButton: true,
    background: '#1e293b',
    color: '#ffffff',
    confirmButtonColor: '#e11d48', // rose-600
    cancelButtonColor: '#475569',  // slate-600
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  })

  if (result.isConfirmed) {
    try {
      await axios.delete(`${API_URL}/users/${user.id}`, getAuthHeader())
      showToast('Pegawai berhasil dihapus', 'success')
      fetchData()
    } catch (err) {
      showToast('Gagal menghapus: ' + (err.response?.data?.message || err.message), 'error')
    }
  }
}

// ---- SYSTEMS ----
const handleAddSystem = async () => {
  if (!newSystem.value.nama_sistem) return
  await axios.post(`${API_URL}/systems`, newSystem.value, getAuthHeader())
  newSystem.value = { nama_sistem: '', deskripsi: '', url_sistem: '' }
  showModalSystem.value = false
  fetchData()
}

const openEditSystemModal = (sys) => {
  editSystemData.value = { ...sys }
  showModalEditSystem.value = true
}

const handleUpdateSystem = async () => {
  try {
    await axios.put(`${API_URL}/systems/${editSystemData.value.id}`, editSystemData.value, getAuthHeader())
    showToast('Data sistem berhasil diperbarui!', 'success')
    showModalEditSystem.value = false
    fetchData()
  } catch (err) {
    showToast('Gagal memperbarui sistem: ' + (err.response?.data?.message || err.message), 'error')
  }
}

const handleDeleteSystem = async (sys) => {
  const result = await Swal.fire({
    title: 'Hapus Sistem?',
    text: `Apakah Anda yakin ingin menghapus sistem "${sys.nama_sistem}"?`,
    icon: 'warning',
    showCancelButton: true,
    background: '#1e293b',
    color: '#ffffff',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#475569',
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  })

  if (result.isConfirmed) {
    try {
      await axios.delete(`${API_URL}/systems/${sys.id}`, getAuthHeader())
      showToast('Sistem berhasil dihapus', 'info')
      fetchData()
    } catch (err) {
      showToast('Gagal menghapus sistem: ' + (err.response?.data?.message || err.message), 'error')
    }
  }
}

// ---- ACCESS VAULT ----
const handleAddAccess = async () => {
  await axios.post(`${API_URL}/access`, newAccess.value, getAuthHeader())
  newAccess.value = { user_id: '', system_id: '', username_sistem: '', raw_password: '', role_akses: '' }
  showModalAccess.value = false
  fetchData()
}

const openEditAccessModal = (acc) => {
  editAccessData.value = { id: acc.id, username_sistem: acc.username_sistem, raw_password: '', role_akses: acc.role_akses }
  showModalEditAccess.value = true
}

const handleUpdateAccess = async () => {
  try {
    await axios.put(`${API_URL}/access/${editAccessData.value.id}`, editAccessData.value, getAuthHeader())
    showToast('Akses berhasil diperbarui!', 'success')
    showModalEditAccess.value = false
    fetchData()
  } catch (err) {
    showToast('Gagal memperbarui akses: ' + (err.response?.data?.message || err.message), 'error')
  }
}

const handleDeleteAccess = async (accessId) => {
  const result = await Swal.fire({
    title: 'Cabut Akses?',
    text: 'Apakah Anda yakin ingin mencabut kredensial hak akses ini?',
    icon: 'warning',
    showCancelButton: true,
    background: '#1e293b',
    color: '#ffffff',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#475569',
    confirmButtonText: 'Ya, Cabut!',
    cancelButtonText: 'Batal'
  })

  if (result.isConfirmed) {
    try {
      await axios.delete(`${API_URL}/access/${accessId}`, getAuthHeader())
      showToast('Hak akses berhasil dicabut', 'success')
      fetchData()
    } catch (err) {
      showToast('Gagal mencabut akses: ' + (err.response?.data?.message || err.message), 'error')
    }
  }
}

// ---- ADMINS (SuperAdmin Only) ----
const handleAddAdmin = async () => {
  try {
    const res = await axios.post(`${API_URL}/admins`, newAdminForm.value, getAuthHeader())
    Swal.fire({ icon: 'success', title: 'Berhasil!', text: res.data.message, background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
    showModalAddAdmin.value = false
    newAdminForm.value = { username: '', password: '', nama_admin: '', role: 'admin' }
    fetchAdmins()
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Oops...', text: err.response?.data?.message || 'Gagal membuat admin', background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
  }
}

const handleDeleteAdmin = async (id) => {
  const result = await Swal.fire({
    title: 'Hapus Admin?',
    text: 'Yakin ingin menghapus akun Admin ini?',
    icon: 'warning',
    showCancelButton: true,
    background: '#1e293b',
    color: '#ffffff',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#475569',
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  })

  if (!result.isConfirmed) return

  try {
    const res = await axios.delete(`${API_URL}/admins/${id}`, getAuthHeader())
    Swal.fire({ icon: 'success', title: 'Berhasil!', text: res.data.message, background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
    fetchAdmins()
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Oops...', text: err.response?.data?.message || 'Gagal menghapus admin', background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
  }
}

// ==========================================
// 7. EXPORT HANDLERS
// ==========================================

const exportToPDF = () => {
  const doc = new jsPDF()
  doc.text('LAPORAN MATRIKS HAK AKSES PEGAWAI', 14, 15)
  const tableColumn = ["NIK", "Nama", "Divisi", "Sistem", "Username", "Role"]
  const tableRows = accesses.value.map(a => [a.nik, a.nama, a.divisi, a.nama_sistem, a.username_sistem, a.role_akses])
  autoTable(doc, { head: [tableColumn], body: tableRows, startY: 25 })
  doc.save(`Laporan_Akses_${new Date().toISOString().slice(0, 10)}.pdf`)
}

const exportToExcel = () => {
  const data = accesses.value.map((a, i) => ({ No: i + 1, NIK: a.nik, Nama: a.nama, Divisi: a.divisi, Sistem: a.nama_sistem, Username: a.username_sistem, Role: a.role_akses }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Akses")
  XLSX.writeFile(wb, `Laporan_Akses_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// State Modal Import Excel
const showModalImportExcel = ref(false)
const selectedFile = ref(null)

const handleFileChange = (event) => {
  selectedFile.value = event.target.files[0]
}

// Fungsi Upload File ke Backend
const handleUploadExcel = async () => {
  if (!selectedFile.value) {
    Swal.fire({ icon: 'warning', title: 'Peringatan', text: 'Silakan pilih file Excel terlebih dahulu!', background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
    return
  }

  const formData = new FormData()
  formData.append('file', selectedFile.value)

  try {
    const res = await axios.post(`${API_URL}/users/upload-excel`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token.value}`
      }
    })
    Swal.fire({ icon: 'success', title: 'Berhasil!', text: res.data.message, background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
    showModalImportExcel.value = false
    selectedFile.value = null
    fetchData() // Refresh tabel pegawai
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Oops...', text: err.response?.data?.message || 'Gagal mengunggah file Excel', background: '#1e293b', color: '#ffffff', confirmButtonColor: '#4f46e5' })
  }
}

// Fungsi Download Contoh Format Template Excel
const downloadTemplateExcel = () => {
  const templateData = [
    { NIK: '1001', Nama: 'Budi Santoso', Divisi: 'IT Support', Status: 'Aktif' },
    { NIK: '1002', Nama: 'Siti Aminah', Divisi: 'Finance', Status: 'Aktif' }
  ]
  const ws = XLSX.utils.json_to_sheet(templateData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Template_Pegawai")
  XLSX.writeFile(wb, "Template_Import_Pegawai.xlsx")
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100 font-sans">
    
    <div v-if="!isLoggedIn" class="flex items-center justify-center min-h-screen bg-slate-950 px-4">
      <div class="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <h2 class="text-2xl font-bold text-center text-white mb-2">CukiM Management</h2>
        <p class="text-center text-slate-400 text-sm mb-6">Login untuk mengakses sistem</p>
        
        <div v-if="loginError" class="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-lg text-center">
          {{ loginError }}
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-xs text-slate-400 mb-1">Username / NIK</label>
            <input v-model="loginForm.username" type="text" required class="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">Password</label>
            <input v-model="loginForm.password" type="password" required class="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm outline-none focus:border-indigo-500" />
          </div>
          <button type="submit" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-all">
            Login
          </button>
        </form>
      </div>
    </div>

    <div v-else-if="currentUser.role === 'superadmin' || currentUser.role === 'admin'" class="flex min-h-screen">
      
      <aside class="w-64 bg-slate-950 border-r border-slate-800 p-6 flex flex-col justify-between">
        <div class="space-y-6">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🛡️</span>
            <div>
              <h1 class="font-bold text-white text-sm">CukiM Management</h1>
              <p class="text-[10px] text-indigo-400 font-semibold uppercase">
                {{ currentUser.role === 'superadmin' ? '👑 Admin Master' : '👤 Admin Biasa' }}
              </p>
            </div>
          </div>

          <nav class="space-y-1">
            <button @click="activeTab = 'dashboard'" :class="activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'" class="w-full text-left px-4 py-2.5 rounded-xl text-xs font-medium transition">
              📊 Dashboard Overview
            </button>
            <button @click="activeTab = 'vault'" :class="activeTab === 'vault' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'" class="w-full text-left px-4 py-2.5 rounded-xl text-xs font-medium transition">
              🔑 Kredensial & Akses
            </button>
            <button @click="activeTab = 'users'" :class="activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'" class="w-full text-left px-4 py-2.5 rounded-xl text-xs font-medium transition">
              👥 Kelola Pegawai
            </button>
            <button @click="activeTab = 'systems'" :class="activeTab === 'systems' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'" class="w-full text-left px-4 py-2.5 rounded-xl text-xs font-medium transition">
              💻 Master Sistem
            </button>
            
            <button v-if="currentUser.role === 'superadmin'" @click="activeTab = 'manage-admins'" :class="activeTab === 'manage-admins' ? 'bg-amber-600 text-white' : 'text-amber-400 hover:bg-amber-500/10'" class="w-full text-left px-4 py-2.5 mt-4 border border-amber-500/20 rounded-xl text-xs font-bold transition flex justify-between items-center">
              <span>👑 Kelola Admin</span>
            </button>
          </nav>
        </div>

        <div class="space-y-3">
          <div class="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <p class="text-xs text-slate-400">Login sebagai:</p>
            <p class="text-sm font-bold text-white truncate">{{ currentUser.nama_admin || currentUser.nama }}</p>
          </div>
          <button @click="handleLogout" class="w-full py-2 bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white rounded-xl text-xs font-semibold transition">
            🚪 Logout
          </button>
        </div>
      </aside>

      <main class="flex-1 p-8 bg-slate-900">
        
        <div v-if="activeTab === 'dashboard'" class="space-y-6">
          <div class="mb-8">
            <h2 class="text-2xl font-bold text-white">👋 Selamat Datang, {{ currentUser.nama_admin || currentUser.nama }}</h2>
            <p class="text-sm text-slate-400 mt-1">Berikut adalah ringkasan data pada sistem CukiM Management.</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <div @click="activeTab = 'users'" class="bg-slate-800 border border-slate-700 rounded-2xl p-6 relative overflow-hidden shadow-lg cursor-pointer hover:bg-slate-800 hover:border-indigo-500 transition-all active:scale-95">
              <div class="text-4xl font-bold text-white relative z-10">{{ totalUsers }}</div>
              <div class="text-sm text-slate-400 mt-2 relative z-10">Total Pegawai</div>
              <div class="absolute -bottom-4 -right-2 text-7xl opacity-10">👥</div>
            </div>
            <div @click="activeTab = 'systems'" class="bg-slate-800 border border-slate-700 rounded-2xl p-6 relative overflow-hidden shadow-lg cursor-pointer hover:bg-slate-800 hover:border-indigo-500 transition-all active:scale-95">
              <div class="text-4xl font-bold text-white relative z-10">{{ totalSystems }}</div>
              <div class="text-sm text-slate-400 mt-2 relative z-10">Total Sistem</div>
              <div class="absolute -bottom-4 -right-2 text-7xl opacity-10">💻</div>
            </div>
            <div @click="activeTab = 'users'" class="bg-slate-800 border border-slate-700 rounded-2xl p-6 relative overflow-hidden shadow-lg cursor-pointer hover:bg-slate-800 hover:border-indigo-500 transition-all active:scale-95">
              <div class="text-4xl font-bold text-white relative z-10">{{ totalDivisi }}</div>
              <div class="text-sm text-slate-400 mt-2 relative z-10">Total Divisi</div>
              <div class="absolute -bottom-4 -right-2 text-7xl opacity-10">🏢</div>
            </div>
            <div @click="activeTab = 'vault'" class="bg-slate-800 border border-slate-700 rounded-2xl p-6 relative overflow-hidden shadow-lg cursor-pointer hover:bg-slate-800 hover:border-indigo-500 transition-all active:scale-95">
              <div class="text-4xl font-bold text-white relative z-10">{{ totalAccesses }}</div>
              <div class="text-sm text-slate-400 mt-2 relative z-10">Total Kredensial Akses</div>
              <div class="absolute -bottom-4 -right-2 text-7xl opacity-10">🔑</div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'manage-admins' && currentUser.role === 'superadmin'" class="space-y-6 max-w-5xl">
          <div class="flex justify-between items-center bg-slate-800 p-6 rounded-2xl border border-slate-700">
            <div>
              <h2 class="text-lg font-bold text-white">👑 Manajemen User Admin</h2>
              <p class="text-xs text-slate-400 mt-1">Kelola akun Admin yang memiliki akses ke dashboard ini.</p>
            </div>
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">🔍</span>
                <input v-model="searchAdmin" placeholder="Cari admin..." class="w-48 pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <button @click="showModalAddAdmin = true" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                + Tambah Admin
              </button>
            </div>
          </div>

          <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/50 text-slate-400 text-xs">
                <tr>
                  <th class="p-4">Nama Admin</th>
                  <th class="p-4">Username</th>
                  <th class="p-4">Tingkatan</th>
                  <th class="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody v-if="isLoading" class="divide-y divide-slate-700/50">
                <tr v-for="i in 5" :key="'skel-adm-'+i">
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-3/4"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/3"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-full"></div></td>
                </tr>
              </tbody>
              <tbody v-else class="divide-y divide-slate-700/50">
                <tr v-for="adm in filteredAdmins" :key="adm.id" class="text-slate-200">
                  <td class="p-4 font-semibold">{{ adm.nama_admin }}</td>
                  <td class="p-4 font-mono">{{ adm.username }}</td>
                  <td class="p-4">
                    <span :class="adm.role === 'superadmin' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'" class="px-2.5 py-1 rounded-full border text-[10px] font-bold">
                      {{ adm.role === 'superadmin' ? '👑 Admin Master' : '👤 Admin Biasa' }}
                    </span>
                  </td>
                  <td class="p-4 text-right">
                    <button v-if="adm.role !== 'superadmin'" @click="handleDeleteAdmin(adm.id)" class="px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-xs hover:bg-rose-500 hover:text-white transition">
                      Hapus
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="activeTab === 'vault'" class="space-y-6">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-white">🔑 Password Vault & Access Matrix</h2>
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">🔍</span>
                <input v-model="searchAccess" placeholder="Cari akses..." class="w-48 pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div class="flex gap-2">
                <button @click="showModalAccess = true" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">+ Tetapkan Akses</button>
                <button @click="exportToExcel" class="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-xs font-bold rounded-xl transition">📊 Excel</button>
                <button @click="exportToPDF" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition">📄 PDF</button>
              </div>
            </div>
          </div>
          
          <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/50 text-slate-400 text-xs">
                <tr>
                  <th class="p-4">Pegawai</th>
                  <th class="p-4">Sistem</th>
                  <th class="p-4">Username / Role</th>
                  <th class="p-4">Password Vault</th>
                  <th class="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody v-if="isLoading" class="divide-y divide-slate-700/50">
                <tr v-for="i in 5" :key="'skel-acc-'+i">
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-3/4"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-2/3"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-full"></div></td>
                </tr>
              </tbody>
              <tbody v-else class="divide-y divide-slate-700/50">
                <tr v-for="acc in filteredAccesses" :key="acc.id" class="text-slate-200">
                  <td class="p-4">
                    <div class="font-semibold">{{ acc.nama }}</div>
                    <div class="text-xs text-slate-400">{{ acc.nik }} • {{ acc.divisi }}</div>
                  </td>
                  <td class="p-4 font-semibold text-indigo-300">{{ acc.nama_sistem }}</td>
                  <td class="p-4">
                    <div class="font-mono text-xs">{{ acc.username_sistem }}</div>
                    <span class="inline-block mt-1 px-2 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded-full">{{ acc.role_akses }}</span>
                  </td>
                  <td class="p-4">
                    <div class="flex items-center gap-2">
                      <span class="font-mono bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg text-xs" :class="decryptedPasswords[acc.id] ? 'text-amber-400' : 'text-slate-500'">
                        {{ decryptedPasswords[acc.id] ? decryptedPasswords[acc.id] : '••••••••••••' }}
                      </span>
                      <button @click="handleViewPassword(acc.id)" class="text-indigo-400 hover:text-indigo-300">
                        {{ decryptedPasswords[acc.id] ? '🔒' : '👁️' }}
                      </button>
                      <span v-if="timers[acc.id]" class="text-[10px] text-amber-500 font-bold">{{ timers[acc.id] }}s</span>
                    </div>
                  </td>
                  <td class="p-4 text-right space-x-2">
                    <button @click="openEditAccessModal(acc)" class="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs hover:bg-amber-500/20">Edit</button>
                    <button @click="handleDeleteAccess(acc.id)" class="px-2 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-xs hover:bg-rose-500/20">Hapus</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="activeTab === 'users'" class="space-y-6">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-white">👥 Master Data Pegawai</h2>
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">🔍</span>
                <input v-model="searchUser" placeholder="Cari pegawai..." class="w-48 pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div class="flex gap-2">
                <button @click="showModalImportExcel = true" class="px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-xs font-bold rounded-xl transition flex items-center gap-2">
                   📊 Import Excel
                 </button>
                  <button @click="showModalUser = true" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">
                   + Tambah Pegawai
                </button>
              </div>
            </div>
          </div>
          <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/50 text-slate-400 text-xs">
                <tr><th class="p-4">NIK</th><th class="p-4">Nama Lengkap</th><th class="p-4">Divisi</th><th class="p-4">Status</th><th class="p-4 text-right">Aksi</th></tr>
              </thead>
              <tbody v-if="isLoading" class="divide-y divide-slate-700/50">
                <tr v-for="i in 5" :key="'skel-usr-'+i">
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-3/4"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-2/3"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/3"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-full"></div></td>
                </tr>
              </tbody>
              <tbody v-else class="divide-y divide-slate-700/50">
                <tr v-for="user in filteredUsers" :key="user.id" class="text-slate-200">
                  <td class="p-4 font-mono text-xs">{{ user.nik }}</td>
                  <td class="p-4 font-semibold">{{ user.nama }}</td>
                  <td class="p-4">{{ user.divisi }}</td>
                  <td class="p-4">
                    <span :class="user.status === 'Aktif' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'" class="px-2 py-1 rounded-full text-[10px] font-bold border border-current">
                      {{ user.status }}
                    </span>
                  </td>
                  <td class="p-4 text-right space-x-2">
                    <button @click="openEditUserModal(user)" class="px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-xs">Edit</button>
                    <button @click="handleDeleteUser(user)" class="px-2 py-1 bg-rose-500/10 text-rose-400 rounded text-xs">Hapus</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="activeTab === 'systems'" class="space-y-6">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-white">💻 Master Sistem Terdaftar</h2>
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">🔍</span>
                <input v-model="searchSystem" placeholder="Cari sistem..." class="w-48 pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <button @click="showModalSystem = true" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">+ Tambah Sistem</button>
            </div>
          </div>
          <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/50 text-slate-400 text-xs">
                <tr><th class="p-4">Nama Sistem</th><th class="p-4">URL</th><th class="p-4">Deskripsi</th><th class="p-4 text-right">Aksi</th></tr>
              </thead>
              <tbody v-if="isLoading" class="divide-y divide-slate-700/50">
                <tr v-for="i in 5" :key="'skel-sys-'+i">
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-3/4"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-full"></div></td>
                  <td class="p-4"><div class="h-4 bg-slate-700/60 rounded animate-pulse w-1/2"></div></td>
                </tr>
              </tbody>
              <tbody v-else class="divide-y divide-slate-700/50">
                <tr v-for="sys in filteredSystems" :key="sys.id" class="text-slate-200">
                  <td class="p-4 font-bold text-indigo-300">{{ sys.nama_sistem }}</td>
                  <td class="p-4 text-xs text-blue-400 hover:underline cursor-pointer"><a :href="sys.url_sistem" target="_blank">{{ sys.url_sistem }}</a></td>
                  <td class="p-4 text-slate-400">{{ sys.deskripsi }}</td>
                  <td class="p-4 text-right space-x-2">
                    <button @click="openEditSystemModal(sys)" class="px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-xs">Edit</button>
                    <button @click="handleDeleteSystem(sys)" class="px-2 py-1 bg-rose-500/10 text-rose-400 rounded text-xs">Hapus</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>

    <div v-else-if="currentUser.role === 'staff'" class="min-h-screen bg-slate-950 p-6">
      <div class="max-w-4xl mx-auto space-y-6">
        
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-lg gap-4">
          <div>
            <h2 class="text-xl font-bold text-white">🔑 Portal Vault Pekerja</h2>
            <p class="text-sm text-slate-400 mt-1">
              Selamat datang, <span class="text-indigo-400 font-semibold">{{ currentUser.nama }}</span>
            </p>
            <div class="flex gap-3 mt-2">
              <span class="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700">NIK: {{ currentUser.nik }}</span>
              <span class="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700">Divisi: {{ currentUser.divisi }}</span>
            </div>
          </div>
          <button @click="handleLogout" class="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs rounded-xl font-bold hover:bg-rose-600 hover:text-white transition">
            🚪 Keluar
          </button>
        </div>

        <h3 class="text-lg font-bold text-white pl-2 border-l-4 border-indigo-500">Akses Sistem Anda</h3>
        
        <div v-if="staffAccessList.length === 0" class="text-center p-12 bg-slate-900 rounded-2xl border border-slate-800 text-slate-500">
          Belum ada akses sistem yang ditetapkan untuk Anda.
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-for="item in staffAccessList" :key="item.id" class="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-colors rounded-2xl p-5 space-y-4 shadow-md">
            
            <div class="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h4 class="font-bold text-white text-base">{{ item.nama_sistem }}</h4>
                <a :href="item.url_sistem" target="_blank" class="text-xs text-blue-400 hover:underline">{{ item.url_sistem }}</a>
              </div>
              <span class="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] rounded-full font-bold">
                {{ item.role_akses }}
              </span>
            </div>
            
            <div class="space-y-2">
              <div class="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span class="text-xs text-slate-400">Username</span>
                <span class="text-sm font-mono text-white font-semibold">{{ item.username_sistem }}</span>
              </div>
              
              <div class="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span class="text-xs text-slate-400">Password</span>
                <div class="flex items-center gap-3">
                  <span class="text-sm font-mono" :class="decryptedPasswords[item.id] ? 'text-amber-400 font-bold' : 'text-slate-500'">
                    {{ decryptedPasswords[item.id] ? decryptedPasswords[item.id] : '••••••••••••' }}
                  </span>
                  <button @click="handleViewPassword(item.id)" class="text-xs bg-slate-800 hover:bg-indigo-600 text-white px-2 py-1 rounded transition">
                    {{ decryptedPasswords[item.id] ? 'Sembunyikan' : 'Lihat' }}
                  </button>
                </div>
              </div>
            </div>
            
            <div v-if="timers[item.id]" class="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
               <div class="h-full bg-amber-500 transition-all duration-1000" :style="`width: ${(timers[item.id] / 10) * 100}%`"></div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <div v-if="showModalAddAdmin" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-lg font-bold text-white mb-4">👑 Tambah Admin Baru</h3>
        <form @submit.prevent="handleAddAdmin" class="space-y-4">
          <input v-model="newAdminForm.nama_admin" placeholder="Nama Lengkap Admin" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
          <input v-model="newAdminForm.username" placeholder="Username Login" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
          <input v-model="newAdminForm.password" type="password" placeholder="Password Login" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
          <select v-model="newAdminForm.role" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm text-slate-300">
            <option value="admin">👤 Admin Biasa (Hanya kelola akses)</option>
            <option value="superadmin">👑 Admin Master (Akses penuh)</option>
          </select>
          <div class="flex justify-end gap-2 pt-4">
            <button type="button" @click="showModalAddAdmin = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan Admin</button>
          </div>
        </form>
      </div>
    </div>

  </div>

  <div v-if="showModalEditUser" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">✏️ Edit Data Pegawai</h3>
      <form @submit.prevent="handleUpdateUser" class="space-y-4">
        <input v-model="editUserData.nik" placeholder="NIK Pegawai" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="editUserData.nama" placeholder="Nama Lengkap" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="editUserData.divisi" placeholder="Divisi (opsional)" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <select v-model="editUserData.status" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm">
          <option value="Aktif">Aktif</option>
          <option value="Non-Aktif">Non-Aktif</option>
        </select>
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalEditUser = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showModalSystem" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">💻 Tambah Master Sistem</h3>
      <form @submit.prevent="handleAddSystem" class="space-y-4">
        <input v-model="newSystem.nama_sistem" placeholder="Nama Sistem" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="newSystem.url_sistem" placeholder="URL Sistem (contoh: https://...)" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <textarea v-model="newSystem.deskripsi" placeholder="Deskripsi Singkat" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"></textarea>
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalSystem = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showModalEditSystem" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">✏️ Edit Master Sistem</h3>
      <form @submit.prevent="handleUpdateSystem" class="space-y-4">
        <input v-model="editSystemData.nama_sistem" placeholder="Nama Sistem" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="editSystemData.url_sistem" placeholder="URL Sistem (contoh: https://...)" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <textarea v-model="editSystemData.deskripsi" placeholder="Deskripsi Singkat" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"></textarea>
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalEditSystem = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showModalUser" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">👥 Tambah Pegawai Baru</h3>
      <form @submit.prevent="handleAddUser" class="space-y-4">
        <input v-model="newUser.nik" placeholder="NIK Pegawai" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="newUser.nama" placeholder="Nama Lengkap" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="newUser.divisi" placeholder="Divisi (opsional)" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalUser = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showModalImportExcel" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
  <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
    <div class="flex justify-between items-center border-b border-slate-800 pb-3">
      <h3 class="text-lg font-bold text-white">📊 Import Data Pegawai via Excel</h3>
      <button @click="showModalImportExcel = false" class="text-slate-400 hover:text-white">✕</button>
    </div>

    <p class="text-xs text-slate-400">
      Unggah file Excel (`.xlsx` / `.xls`) dengan kolom header: <b class="text-indigo-300">NIK, Nama, Divisi, Status</b>.
    </p>

    <button @click="downloadTemplateExcel" class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition">
      📥 Download Format Template Excel
    </button>

    <div class="space-y-2 pt-2">
      <label class="block text-xs text-slate-300">Pilih File Excel:</label>
      <input type="file" @change="handleFileChange" accept=".xlsx, .xls" class="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer" />
    </div>

    <div class="flex justify-end gap-2 pt-4 border-t border-slate-800">
      <button type="button" @click="showModalImportExcel = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold">Batal</button>
      <button type="button" @click="handleUploadExcel" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">Proses Import</button>
    </div>
  </div>
</div>
  <div v-if="showModalAccess" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">🔑 Tetapkan Hak Akses</h3>
      <form @submit.prevent="handleAddAccess" class="space-y-4">
        <select v-model="newAccess.user_id" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm">
          <option value="" disabled>Pilih Pegawai</option>
          <option v-for="user in users" :key="user.id" :value="user.id">{{ user.nama }}</option>
        </select>
        <select v-model="newAccess.system_id" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm">
          <option value="" disabled>Pilih Sistem</option>
          <option v-for="sys in systems" :key="sys.id" :value="sys.id">{{ sys.nama_sistem }}</option>
        </select>
        <input v-model="newAccess.username_sistem" placeholder="Username Sistem" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="newAccess.raw_password" type="password" placeholder="Password Vault" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="newAccess.role_akses" placeholder="Role (e.g. User, Admin)" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalAccess = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="showModalEditAccess" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">✏️ Edit Hak Akses</h3>
      <form @submit.prevent="handleUpdateAccess" class="space-y-4">
        <input v-model="editAccessData.username_sistem" placeholder="Username Sistem" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="editAccessData.raw_password" type="password" placeholder="Password Vault (Kosongkan jika tidak diubah)" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <input v-model="editAccessData.role_akses" placeholder="Role (e.g. User, Admin)" required class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm" />
        <div class="flex justify-end gap-2 pt-4">
          <button type="button" @click="showModalEditAccess = false" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold">Batal</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>

</template>