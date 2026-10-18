const autorizarPerfil = (...perfisPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ mensagem: "Usuario não autentificado" });
    }
    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res
        .status(403)
        .json({ mensagem: "Acesso negado para esse perfil" });
    }
    return next();
  };
};

export default autorizarPerfil;
