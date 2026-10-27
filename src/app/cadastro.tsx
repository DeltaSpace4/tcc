import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { auth } from "../../FirebaseConfig";
import { globalStyles } from "../styles/global";

export default function Cadastro() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signUp = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("User registered:", userCredential.user);
      if(userCredential.user) { router.push("/home"); }
    } catch (error) {
      console.error("Error registering user:", error);
      if(email === "" || password === "") {
      alert("Preencha todos os campos antes de criar a conta.");
      }else if(password.length < 6) {
        alert("A senha deve ter pelo menos 6 caracteres.");
      }else{
        alert("Este email já esta vinculado a uma conta, tente outro email.");
      }
    }
  };



  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Cadastro</Text>
      <TextInput style={globalStyles.textInput}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        placeholderTextColor={globalStyles.placeholderText.color}
      />
      <TextInput style={globalStyles.textInput}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={globalStyles.placeholderText.color}
      />
      <TouchableOpacity onPress={signUp} style={globalStyles.button}>
        <Text style={globalStyles.buttonText}>Criar conta</Text>
      </TouchableOpacity>
    </View>
  );
}