
const bcrypt = require("bcrypt");
const path = require("path");
const { Op } = require("sequelize");
const _ = require("lodash");
const errorHandler = require("../helpers/errorHandler");
const { db, sequelize } = require("../config/dbConnection");
const { generateToken, refreshToken } = require("../helpers/jwtToken");
const { mailDetails, sendMail, transporter } = require("../helpers/emailTransporter");
const {
  findAndCreateSessionWithID,
  updateSessionWithID,
} = require("../helpers/patientSession");

const Patient = db.patient;
const User = db.user;
const Roles = db.role;
const saltRounds = process.env.BCRYPT_SALTROUNDS;

// Get html of template
async function getHtmlContent(templateName, replaceData) {
  return await db.emailTemplate
    .findOne({ where: { slug: templateName } })
    .then((template) => {
      const data = template.dataValues.context;
      let html = data.toString();

      _.keys(replaceData).forEach((key) => {
        html = html.replace(key, replaceData[key]);
      });
      return html;
    });
}

// Registration of patient
const register = async (req, res, next) => {
  console.log("===========================================register   ");
  const { name, email, password } = req.body;

  const salt = await bcrypt.genSalt(parseInt(saltRounds));

  const patient = {
    name: name,
    email: email,
    password: await bcrypt.hash(password, salt),
  };

  const role = await Roles.findOne({
    where: { name: "Patient" }, // Specify the search criteria
  });

  console.log("role", role);

  await Patient.create(patient)
    .then(async (patient) => {
      await patient.update({
        roleId: role.id,
      });

      const { id, name, email } = patient.toJSON();

      const token = generateToken({ id, name, email });

      if (token.length !== 0) {

        console.log("INSIDE TOKEN IF STATEMENT");
        const emailTransporter = transporter();

        const mailData = mailDetails(
          "userName",
          `Welcome ${name}`,
          "wwwwqq@yopmail.com",
          "helloo yes your here"
        );

        const sendMail = async (mailDetails) => {
          try {
            await transporter().sendMail(mailDetails);
            console.log("Email has been sent.....");

          } catch (error) {
            console.log(error);
            console.log("INSIDE CATCH SENDMAIL STATEMENT");
          }
        };

        sendMail(mailData);

      }
      return res.json({
        status: 200,
        msg: "Token generated succesfully.",
        token
      });
    })
    .catch((err) => {
      console.log(err)
      if (!err.errors) {
        return next(errorHandler(500, "Server internal error. Please try after some time."));
      } else {
        return err.errors.forEach((err) => {
          next(errorHandler(400, err.message));
        });
      }
    });
};

// fetch list of patients

const getAllPatients = async (req, res, next) => {

  const patients = await Patient.findAll();
  res.json({ result: patients })

}

const getPatientDetails = async (req, res, next) => {

  
  const uniqueId = req.params.uniqueId
try{
  const patient = await Patient.findOne({
    where:{
      uniqueId
    }
  })

  res.json({ result: patient })

}catch(err){
  console.log(err,"err")
}

}


const editPatient = async (req, res, next) => {

  const uniqueId = req.params.uniqueId
  const patientDetails = req.body

  try {
    const patient = await Patient.findOne({ where: { uniqueId } });

    if (patient === null) {
      console.log('Not found!');
    } else {
      console.log(patient instanceof Patient); // true
      console.log(patient, "patient");
    }

    patient.set({
      ...patient,
      ...patientDetails
    });


    await patient.save();

    res.send({
      "result": 'patient updated successfully'
    })
  } catch (err) {

    console.log(err, "err");
    res.send({
      "error": err
    })

  }
}

const deletePatient = async (req, res, next) => {

  const uniqueId = req.params.uniqueId
  console.log(uniqueId,"uniqueid")
 
  const patient = await Patient.findOne({ where: { uniqueId } });
  console.log(patient,"gbxhjbh")

  try {
    await patient.destroy()

    res.send({
      result: "deleted patient"
    })
  } catch (err) {
    console.log(err, "err")
  }
}


// Login of patient
const login = async (req, res, next) => {

  const { email, password } = req.body;

  if (typeof email === "undefined" || typeof password === "undefined") {
    return next(errorHandler(400, "Invalid request"));
  }
  // Authenticate the user (you can use bcrypt or other methods for password hashing)
  const patient = await Patient.findOne({
    include: [
      {
        model: Roles,
      },
    ],
    where: { email },
  });

  if (!patient) {
    return next(errorHandler(401, "Invalid credentials"));
  } else {
    const dbData = patient.dataValues;
    bcrypt.compare(password, dbData.password, async (error, response) => {
      if (response) {

        const { id, uniqueId, name, email, role } = dbData;
        console.log(dbData, "dbdat6a");
        const roleName = role.dataValues.name;

        await findAndCreateSessionWithID(id, roleName);

        const token = generateToken({ id, uniqueId, name, email, roleName });
        const refreshJWTToken = refreshToken({
          id,
          uniqueId,
          name,
          email,
          roleName,
        });
        await updateSessionWithID(id, token, refreshJWTToken, roleName);
        // localStorage.setItem("token",token)

        return res.status(200).json({
          token: token,
          // expiresIn: "3h",
          refreshToken: refreshJWTToken,
          // refreshExpiresIn: "2d",
          msg: "Login successfully.",
        });
      } else {
        return next(errorHandler(401, "Invalid credentials"));
      }
    });
  }
};

/**
 * Forgot password function firstly check the expire time
 * and can be access from outside api
 */
const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (typeof email === "undefined") {
    return next(errorHandler(400, "Invalid request"));
  }
  const patient = await Patient.findOne({
    include: [
      {
        model: db.role,
        attribute: ["name"],
      },
    ],
    where: { email },
  });
  // console.log(patient);
  if (!patient) {
    return res.status(200).json({ msg: "Email sent successfully." });
  } else {
    const { id, uniqueId, name, email } = patient;

    const roleName = patient.dataValues.role.dataValues.name;

    await findAndCreateSessionWithID(id, roleName);
    await updateSessionWithID(id, null, null, roleName);

    const token = generateToken({ id, uniqueId, name, email });
    patient.update({
      token: token,
    });
    // console.log(token);
    const url = process.env.ADMIN_FRONTEND_URL;
    let activationURL = path.join(url, `resetPassword?secret=${token}`);

    let replaceData = {
      NAME: name,
      URL: activationURL,
    };

    html = await getHtmlContent("forgotPassword_template", replaceData);

    const mailData = mailDetails(
      "Reset Password",
      `Reset your password ${name}`,
      email,
      html
    );
    sendMail(mailData);
    return res.status(200).json({ msg: "Email sent successfully." });
  }
};

/**
 * Change password function firstly check the expire time
 * and can be access from inside api
 */
const changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const email = req.user.email;

  if (
    typeof oldPassword === "undefined" &&
    typeof newPassword === "undefined"
  ) {
    return next(errorHandler(400, "Invalid request"));
  }

  let patient = await Patient.findOne({
    include: [
      {
        model: Roles,
      },
    ],
    where: {
      email,
      token: null,
    },
  });
  // console.log(patient);
  if (!patient) {
    return res.status(400).json({ msg: "Error updating password." }); // Change password(400).json({ msg: "Patient not found." });
  } else {
    const dbData = patient.dataValues;
    bcrypt.compare(oldPassword, dbData.password, async (error, response) => {
      if (response) {
        const roleName = dbData.role.dataValues.name;
        // let newPassword = newPassword;
        Patient.prototype.updatePassword = async function (newPassword) {
          const salt = await bcrypt.genSalt(parseInt(saltRounds));
          const hashedPassword = await bcrypt.hash(newPassword, salt);
          this.password = hashedPassword;
          this.token = null;
          await this.save();
        };
        await findAndCreateSessionWithID(dbData.id, roleName);
        await updateSessionWithID(dbData.id, null, null, roleName);

        patient.updatePassword(newPassword);
        return res.status(200).json({ msg: "Password updated successfully" });
      } else {
        return next(errorHandler(401, "Invalid credentials"));
      }
    });
  }
};

/**
 * Reset password function firstly check the expire time
 * and then check the patient database for having token or null
 */
const resetPassword = async (req, res, next) => {
  const { password } = req.body;
  const email = req.user.email;

  if (typeof password === "undefined") {
    return next(errorHandler(400, "Invalid request"));
  }

  let patient = await Patient.findOne({
    where: {
      email,
      token: {
        [Op.not]: null,
      },
    },
  });
  // console.log(patient);
  if (!patient) {
    return res.status(400).json({ msg: "Error updating password." }); // Change password(400).json({ msg: "Patient not found." });
  } else {
    let newPassword = password;
    Patient.prototype.updatePassword = async function (newPassword) {
      const salt = await bcrypt.genSalt(parseInt(saltRounds));
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      this.password = hashedPassword;
      this.token = null;
      await this.save();
    };

    patient.updatePassword(newPassword);
    return res.status(200).json({ msg: "Password updated successfully" });
  }
};

// Add Practitioner
const addPractitioner = async (req, res, next) => {
  let { firstName, lastName, phoneNumber, email, countryCode, address } =
    req.body;
  let patientData = req.user;
  let fullName = `${firstName}${!lastName ? "" : " " + lastName}`;
  let practitioner = {
    firstName: firstName,
    lastName: lastName,
    fullName,
    countryCode: countryCode,
    phoneNumber: phoneNumber,
    email: email,
    address: address,
  };
  await User.create(practitioner)
    .then(async (user) => {
      let {
        uniqueId,
        firstName,
        lastName,
        email,
        phoneNumber,
        countryCode,
        address,
      } = user.toJSON();
      await db.role
        .findOne({ where: { name: "practitioner" } })
        .then((role) => {
          user.setRole(role);
        });
      await db.patient
        .findOne({ where: { email: patientData.email } })
        .then((patient) => {
          user.setPatient(patient);
        });

      let token = generateToken({
        uniqueId,
        firstName,
        lastName,
        email,
        phoneNumber,
        countryCode,
        address,
      });
      user.update(
        {
          token: token,
        },
        {
          where: {
            uniqueId: this.uniqueId,
          },
        }
      );

      const url = process.env.FRONTEND_URL;
      let userName = `${firstName}${!lastName ? "" : " " + lastName}`;
      let activationURL = path.join(url, `setPassword?token=${token}`);
      let replaceData = {
        PRACTITIONER_NAME: userName,
        NAME: patientData.name,
        URL: activationURL,
      };

      html = await getHtmlContent("welcome_template", replaceData);

      let mailData = mailDetails(
        patientData.name,
        `Welcome ${userName}`,
        email,
        html
      );
      sendMail(mailData);

      return res.json({
        status: 200,
        msg: "Practitioner added succesfully.",
      });
    })
    .catch((err) => {
      // console.log("Error");
      // console.log(err);
      if (!err.errors) {
        return next(errorHandler(500, "Server internal error. Please try after some time."));
      } else {
        return err.errors.forEach((err) => {
          next(errorHandler(400, err.message));
        });
      }
    });
};

// Practitioner List
const practitionersList = async (req, res, next) => {
  try {
    const { searchText, status, createdAt, sortName, sort, limit, page } = req.body;
    let { id } = req.user;
    let searchBy = {};
    let columnName = sortName ? sortName : "createdAt";
    let order = sort ? sort : "desc";
    if (searchText !== undefined && searchText !== "") {
      searchBy[Op.or] = [
        {
          firstName: {
            [Op.like]: sequelize.fn('LOWER', `%${searchText.toLowerCase()}%`),
          },
        },
        {
          lastName: {
            [Op.like]: sequelize.fn('LOWER', `%${searchText.toLowerCase()}%`),
          },
        },
        {
          fullName: {
            [Op.like]: sequelize.fn('LOWER', `%${searchText.toLowerCase()}%`),
          },
        },
        {
          email: {
            [Op.like]: sequelize.fn('LOWER', `%${searchText.toLowerCase()}%`),
          },
        },
        {
          address: {
            [Op.like]: sequelize.fn('LOWER', `%${searchText.toLowerCase()}%`),
          },
        },
      ]
    }
    if (status !== undefined && status !== "") {
      searchBy.status = {
        [Op.eq]: status
      }
    }
    if (createdAt !== undefined && createdAt !== "") {
      searchBy.createdAt = {
        [Op.lte]: new Date(createdAt)
      }
    }
    searchBy.patientId = {
      [Op.eq]: id
    }
    const { count, rows } = await User.findAndCountAll({
      where: searchBy,
      include: [Roles, Patient],
      order: [[`${columnName}`, `${order}`]],
      offset: page ? (page - 1) * limit : 0,
      limit: limit ? limit : 10,
    });
    const practitionersData = [];
    for (let index = 0; index < rows.length; index++) {
      const practitioner = rows[index];
      const practitionerArr = {};
      const {
        uniqueId,
        firstName,
        lastName,
        password,
        phoneNumber,
        email,
        countryCode,
        address,
        status,
      } = practitioner.dataValues;
      const patientName = practitioner.patient.dataValues.name;

      let userName = `${firstName}${!lastName ? "" : " " + lastName}`;
      practitionerArr["firstName"] = firstName;
      practitionerArr["lastName"] = lastName;
      practitionerArr["fullName"] = userName;
      practitionerArr["uniqueId"] = uniqueId;
      practitionerArr["email"] = email;
      practitionerArr["countryCode"] = countryCode;
      practitionerArr["phoneNumber"] = phoneNumber;
      practitionerArr["address"] = address;
      practitionerArr["patientName"] = patientName;
      practitionerArr["status"] = status;
      if (password === null) {
        practitionerArr["isActive"] = false;
      } else {
        practitionerArr["isActive"] = true;
      }
      practitionersData.push(practitionerArr);
    }
    // console.log(practitionersData);
    return res.status(200).json({
      totalCount: count,
      data: practitionersData,
      msg: "Practitioners list.",
    });
  } catch (err) {
    // console.log(err);
    if (!err.errors) {
      return next(errorHandler(500, "Server internal error. Please try after some time."));
    } else {
      let errMsg;
      for (let index = 0; index < err.errors.length; index++) {
        errMsg = err.message;
      }
      return next(errorHandler(400, errMsg));
    }
  }
};
// Delete practitioner
const deletePractitioner = async (req, res, next) => {
  const { uniqueId } = req.body;
  try {
    const users = await User.findOne({
      where: {
        uniqueId
      }
    });
    if (users) {
      const userUpdate = await users.update({
        uniqueId: `${users.id} is deleted`
      });
      const userDesotry = await users.destroy();
      return res.status(200).json({
        msg: "Practitioners deleted succesfully.",
      });
    } else {
      return res.status(404).json({
        msg: "Not found",
      });
    }
  } catch (err) {
    if (!err.errors) {
      return next(errorHandler(500, "Server internal error. Please try after some time."));
    } else {
      return err.errors.forEach((err) => {
        next(errorHandler(400, err.message));
      });
    }
  }
};

/**
 * Logout will null user's session token and refresh token in session table
 */
const logout = async (req, res) => {
  let patientData = req.user;
  const { id, roleName } = patientData;
  await updateSessionWithID(id, null, null, roleName);
  return res.json({
    status: 200,
    msg: "Logout succesfully.",
  });
};

/**
 * Refresh token will update the new token and refresh tokens in session table
 */
const refreshTokenAPI = async (req, res, next) => {
  let { id, uniqueId, name, email, roleName } = req.user;
  let refreshToken = req.refreshToken;
  try {
    await findAndCreateSessionWithID(id, roleName);
    const token = generateToken({ id, uniqueId, name, email, roleName });
    await updateSessionWithID(id, token, refreshToken, roleName);

    return res.status(200).json({
      token: token,
      msg: "Token is updated successfully.",
    });
  } catch (err) {
    if (!err.errors) {
      return next(errorHandler(500, "Server internal error. Please try after some time."));
    } else {
      return err.errors.forEach((err) => {
        next(errorHandler(400, err.message));
      });
    }
  }
};

/**
 * Edit practitioner
 */
const editPractitioner = async (req, res, next) => {
  let { uniqueId } = req.params;
  let { firstName, lastName, countryCode, phoneNumber, address } = req.body;
  try {
    const practitioner = await User.findOne({ where: { uniqueId } });
    if (!practitioner) {
      return res.status(404).json({ message: "Practitioner not found" });
    }
    if (firstName) practitioner.firstName = firstName;
    if (lastName) practitioner.lastName = lastName;
    if (countryCode) practitioner.countryCode = countryCode;
    if (phoneNumber) practitioner.phoneNumber = phoneNumber;
    if (address) practitioner.address = address;

    await practitioner.save();

    return res
      .status(200)
      .json({ message: "Practitioner profile updated successfully" });
  } catch (err) {
    // console.log(err);
    if (!err.errors) {
      return next(errorHandler(500, "Server internal error. Please try after some time."));
    } else {
      return err.errors.forEach((err) => {
        next(errorHandler(400, err.message));
      });
    }
  }
};

/**
 * Active and deactive practitioner status
 */
const changeStatus = async (req, res, next) => {
  const { uniqueId } = req.params;
  let { status } = req.body;
  if (status !== 0 || status !== 1) {
    return res
      .status(404)
      .json({ message: `Please provide a proper status for user.` });
  }
  try {
    const statusData = await User.findOne({
      where: {
        uniqueId,
      },
    });
    if (statusData !== null) {
      await statusData.update({ status });

      return res
        .status(200)
        .json({
          message: `Practitioner is ${status === 0 ? "deactivated" : "actived"
            }.`,
        });
    }
    return res.status(404).json({ message: `Practitioner is not found.` });
  } catch (err) {
    err.errors.forEach((err) => {
      next(errorHandler(400, err.message));
    });
  }
};

module.exports = {
  register,
  getAllPatients,
  login,
  forgotPassword,
  changePassword,
  resetPassword,
  addPractitioner,
  practitionersList,
  deletePractitioner,
  logout,
  refreshTokenAPI,
  editPractitioner,
  changeStatus,
  editPatient,
  deletePatient,
  getPatientDetails
};
