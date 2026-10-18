import jwt from "jsonwebtoken";

//middeware para verificar a autentificação
const autentificar = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ mensagem: "Token nao informado" });
  }

  // separar a palavra BEARER do token
  const partes = authorization.split(" ");
  //verificar se o formato esta correto
  if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
    return res.status(401).json({ mensagem: "Formato do token invalido" });
  }
  const token = partes[1];
  //Verifica a configuracao do servidor
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET nao configurado");
    return res.status(500).json({ mensagem: "Erro interno do servidor" });
  }
  //Verificar a ssinatura e a validade do JWT
  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = dados;
    //Perminir que a requisicao continue
    return next();
  } catch (error) {
    return res.status(401).json({ mensagem: "Token invalido ou expirado" });
  }
};
export default autentificar;
