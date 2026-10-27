import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { auth, deleteUserAccount, updateUser } from "../../FirebaseConfig";
import { globalStyles } from "../styles/global";

export default function Conta() {
  const [password, getNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const getCurrentUser = auth.currentUser;

  const updatePassword = async () => {
    if (!getCurrentUser) {
      alert("Nenhum usuário autenticado.");
      return;
    }

    try {
      await updateUser({ user: getCurrentUser, password });
    } catch (error) {
      console.error("Error updating password:", error);
    }
  };

  const deleteAccount = async () => {
    if (!getCurrentUser) {
      alert("Nenhum usuário autenticado.");
      return;
    }

    if (!currentPassword) {
      alert("Digite sua senha atual para excluir a conta.");
      return;
    }

    try {
      await deleteUserAccount(getCurrentUser, currentPassword);
      router.replace("/");
    } catch (error) {
      console.error("Error deleting user account:", error);
      alert("Não foi possível excluir a conta. Verifique sua senha e tente novamente.");
    }
  };

  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Gerenciamento de Conta</Text>
      <TextInput style={globalStyles.textInput}
        placeholder="Nova senha"
        value={password}
        onChangeText={getNewPassword}
        secureTextEntry
        placeholderTextColor={globalStyles.placeholderText.color}
      />
      <TouchableOpacity onPress={updatePassword} style={globalStyles.button}>
        <Text style={globalStyles.buttonText}>Alterar senha</Text>
      </TouchableOpacity>
      <TextInput style={globalStyles.textInput}
        placeholder="Senha atual para excluir a conta"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        placeholderTextColor={globalStyles.placeholderText.color}
      />
      <TouchableOpacity onPress={deleteAccount} style={globalStyles.button}>
        <Text style={globalStyles.buttonText}>Excluir conta</Text>
      </TouchableOpacity>
            <TouchableOpacity onPress={() => {auth.signOut(); router.push("/")}} style={globalStyles.button}>
        <Text style={globalStyles.buttonText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}