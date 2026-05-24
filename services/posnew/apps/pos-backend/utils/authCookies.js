const config = require("../config/config");

function accessCookieOptions() {
  if (config.posDevCrossSiteCookies) {
    return {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    };
  }
  return {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    path: "/",
    sameSite: config.nodeEnv === "production" ? "none" : "lax",
    secure: config.nodeEnv === "production",
  };
}

function refreshCookieOptions() {
  if (config.posDevCrossSiteCookies) {
    return {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    };
  }
  return {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    path: "/",
    sameSite: config.nodeEnv === "production" ? "none" : "lax",
    secure: config.nodeEnv === "production",
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("accessToken", accessToken, accessCookieOptions());
  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, refreshCookieOptions());
  }
}

function clearAuthCookies(res) {
  res.clearCookie("accessToken", { ...accessCookieOptions(), maxAge: 0 });
  res.clearCookie("refreshToken", { ...refreshCookieOptions(), maxAge: 0 });
}

module.exports = {
  accessCookieOptions,
  refreshCookieOptions,
  setAuthCookies,
  clearAuthCookies,
};
