// admin routes

const router = require('express').Router();
const adminController = require('../controllers/admin.controller');
const { auth, refreshAuth } = require('../middleware/adminAuth');

// list admins, edit admin and delete admin routes
// edit paths and add unique id

router.post('/admin-add', adminController.adminAdd);
router.post('/login', adminController.login);
router.get('/admin-list', auth, adminController.getAllAdmins);
router.get('/admin-get/:uniqueId', auth, adminController.getAdminDetails);
router.put('/admin-update/:uniqueId', auth, adminController.editAdmin);
router.delete('/admin-delete/:uniqueId',auth, adminController.deleteAdmin) ;
router.post('/logout', auth, adminController.logout);

router.post('/forgot-password', adminController.forgotPassword);
router.post('/reset-password', auth, adminController.resetPassword);
router.post('/change-password', auth, adminController.changePassword);

router.post('/addPractitioner', auth, adminController.addPractitioner);
router.post('/practitionersList', auth, adminController.practitionersList);
router.post('/deletePractitioner', auth, adminController.deletePractitioner);
router.post('/edit/:uniqueId', auth, adminController.editPractitioner);
router.post('/changeStatus/:uniqueId', auth, adminController.changeStatus);
router.get('/refreshToken', refreshAuth, adminController.refreshTokenAPI);

module.exports = router;
