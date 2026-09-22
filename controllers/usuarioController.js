// importando o usuarioService
import usuarioService from "../services/usuarioService.js"

// funcao para listar todos os usuarios
const getAllUsuarios = async (req, res) => {
    try {
        // busca os usuarios no usuarioService
        const usuarios = await usuarioService.getAllUsuarios()

        // retorna todos os usuarios cadastrados
        return res.status(200).json(usuarios)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao buscar usuarios",
            erro: error.message
        })
    }
}

// funcao para listar o usuario pelo ID
const getUsuarioById = async (req, res) => {
    try {
        const id = req.params.id

        // buscar o usuario atraves do service
        const usuario = await usuarioService.getUsuarioById(id)

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuario nao encontrado"
            })
        }

        return res.status(200).json(usuario)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao buscar usuario",
            erro: error.message
        })
    }
}

// funcao para cadastro de um usuario
const postUsuario = async (req, res) => {
    try {
        const nome = req.body.nome
        const email = req.body.email
        const senha = req.body.senha
        const perfil = req.body.perfil

        if (!nome || !email || !senha || !perfil) {
            return res.status(400).json({
                mensagem: "Campos obrigatorios nao preenchidos"
            })
        }

        const novoUsuario = await usuarioService.postUsuario(nome, email, senha, perfil)

        return res.status(201).json(novoUsuario)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao cadastrar usuario",
            erro: error.message
        })
    }
}

// funcao para atualizar totalmente o usuario
const putUsuarioById = async (req, res) => {
    try {
        const id = req.params.id

        const nome = req.body.nome
        const email = req.body.email
        const senha = req.body.senha
        const perfil = req.body.perfil

        if (!nome || !email || !senha || !perfil) {
            return res.status(400).json({
                mensagem: "Campos obrigatorios nao preenchidos"
            })
        }

        const usuario = await usuarioService.putUsuarioById(id, nome, email, senha, perfil)

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuario nao encontrado"
            })
        }

        return res.status(200).json(usuario)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao atualizar usuario",
            erro: error.message
        })
    }
}

// funcao para atualizar campo especifico do usuario
const patchUsuarioById = async (req, res) => {
    try {
        const id = req.params.id

        const dadosAtualizados = req.body

        const usuario = await usuarioService.patchUsuarioById(id, dadosAtualizados)

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuario nao encontrado"
            })
        }

        return res.status(200).json(usuario)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao atualizar parcialmente usuario",
            erro: error.message
        })
    }
}

// funcao para deletar um usuario
const deleteUsuarioById = async (req, res) => {
    try {
        const id = req.params.id

        const usuarioDeletado = await usuarioService.deleteUsuarioById(id)

        if (!usuarioDeletado) {
            return res.status(404).json({
                mensagem: "Usuario nao encontrado"
            })
        }

        return res.sendStatus(204)
    } catch (error) {
        return res.status(500).json({
            mensagem: "Erro ao deletar usuario",
            erro: error.message
        })
    }
}

export default {getAllUsuarios, getUsuarioById, postUsuario, putUsuarioById, patchUsuarioById, deleteUsuarioById }